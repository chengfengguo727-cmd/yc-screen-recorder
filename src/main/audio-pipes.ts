import { createServer, Server, Socket } from 'net'
import { randomBytes } from 'crypto'

export interface AudioPipe {
  path: string
  write: (buf: Buffer) => void
  close: () => Promise<void>
  isConnected: () => boolean
}

export function createAudioPipe(tag: string): Promise<AudioPipe> {
  const path = `\\\\.\\pipe\\screen-recorder-${tag}-${randomBytes(4).toString('hex')}`
  let socket: Socket | null = null
  let server: Server
  const pendingChunks: Buffer[] = []
  const MAX_PENDING = 32

  return new Promise((resolve, reject) => {
    server = createServer((s) => {
      socket = s
      s.on('error', () => {})
      s.on('close', () => {
        socket = null
      })
      while (pendingChunks.length > 0) {
        const chunk = pendingChunks.shift()
        if (chunk) s.write(chunk)
      }
    })
    server.on('error', reject)
    server.listen(path, () => {
      resolve({
        path,
        write: (buf): void => {
          if (socket && !socket.destroyed) {
            socket.write(buf)
          } else if (pendingChunks.length < MAX_PENDING) {
            pendingChunks.push(buf)
          }
        },
        close: async (): Promise<void> => {
          try {
            socket?.end()
          } catch {
            // ignore
          }
          await new Promise<void>((res) => server.close(() => res()))
        },
        isConnected: (): boolean => socket !== null && !socket.destroyed
      })
    })
  })
}
