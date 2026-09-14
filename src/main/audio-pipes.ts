import { createServer, Server, Socket } from 'net'
import { randomBytes } from 'crypto'

export interface AudioPipe {
  path: string
  write: (buf: Buffer) => void
  close: () => Promise<void>
  isConnected: () => boolean
  /** Corrections the timeline guard has made so far, for the log. */
  stats: () => { filledMs: number; droppedMs: number }
}

export interface AudioPipeFormat {
  sampleRate: number
  channels: number
}

// Newest audio kept while waiting for ffmpeg to connect.
const MAX_PENDING_MS = 2000
// ffmpeg holds the screen capture back whenever the audio timeline falls 100ms
// behind the video timeline, so audio is kept within this distance of it.
const GUARD_TOLERANCE_MS = 50
// A correction brings the audio back to this distance.
const GUARD_TARGET_MS = 20
const GUARD_INTERVAL_MS = 10

export function createAudioPipe(tag: string, format: AudioPipeFormat): Promise<AudioPipe> {
  const path = `\\\\.\\pipe\\screen-recorder-${tag}-${randomBytes(4).toString('hex')}`
  const frameBytes = format.channels * 2 // s16le
  const bytesPerMs = (format.sampleRate * frameBytes) / 1000
  const alignDown = (bytes: number): number =>
    Math.max(0, Math.floor(bytes / frameBytes)) * frameBytes
  let socket: Socket | null = null
  let server: Server
  let connectedOnce = false
  const pending: Buffer[] = []
  let pendingBytes = 0

  // ffmpeg timestamps this audio purely by how many samples it has read, while
  // the screen capture is timestamped by the wall clock. When audio stops
  // arriving for a moment (renderer busy) or the sound card's clock runs a bit
  // slow, the audio timeline falls behind and ffmpeg stalls the video to wait
  // for it. The guard keeps audio on the wall clock: it pads with silence when
  // audio is late, then discards the same amount once the late audio arrives.
  let t0 = 0
  let baseBytes = 0
  let writtenBytes = 0
  let filledBytes = 0
  let droppedBytes = 0
  let guardTimer: NodeJS.Timeout | null = null

  const offsetBytes = (): number => writtenBytes - baseBytes - (performance.now() - t0) * bytesPerMs
  const send = (buf: Buffer): void => {
    socket?.write(buf)
    writtenBytes += buf.length
  }
  const stopGuard = (): void => {
    if (guardTimer) clearInterval(guardTimer)
    guardTimer = null
  }
  const guard = (): void => {
    if (!socket || socket.destroyed) return
    const behind = -offsetBytes()
    if (behind > GUARD_TOLERANCE_MS * bytesPerMs) {
      const fill = alignDown(behind - GUARD_TARGET_MS * bytesPerMs)
      if (fill > 0) {
        send(Buffer.alloc(fill))
        filledBytes += fill
      }
    }
  }

  return new Promise((resolve, reject) => {
    server = createServer((s) => {
      socket = s
      connectedOnce = true
      s.on('error', () => {})
      s.on('close', () => {
        socket = null
        stopGuard()
      })
      // Audio captured before ffmpeg was ready counts as already elapsed, so
      // the guard only corrects drift from here on and keeps the start intact.
      t0 = performance.now()
      for (const chunk of pending.splice(0)) send(chunk)
      pendingBytes = 0
      baseBytes = writtenBytes
      guardTimer = setInterval(guard, GUARD_INTERVAL_MS)
    })
    server.on('error', reject)
    server.listen(path, () => {
      resolve({
        path,
        write: (buf): void => {
          if (!socket || socket.destroyed) {
            if (connectedOnce) return
            pending.push(buf)
            pendingBytes += buf.length
            while (pendingBytes > MAX_PENDING_MS * bytesPerMs && pending.length > 1) {
              pendingBytes -= pending.shift()!.length
            }
            return
          }
          let data = buf
          const ahead = offsetBytes() + data.length
          if (ahead > GUARD_TOLERANCE_MS * bytesPerMs) {
            const drop = Math.min(data.length, alignDown(ahead - GUARD_TARGET_MS * bytesPerMs))
            data = data.subarray(drop)
            droppedBytes += drop
          }
          if (data.length > 0) send(data)
        },
        close: async (): Promise<void> => {
          stopGuard()
          try {
            socket?.end()
          } catch {
            // ignore
          }
          await new Promise<void>((res) => server.close(() => res()))
        },
        isConnected: (): boolean => socket !== null && !socket.destroyed,
        stats: () => ({
          filledMs: Math.round(filledBytes / bytesPerMs),
          droppedMs: Math.round(droppedBytes / bytesPerMs)
        })
      })
    })
  })
}
