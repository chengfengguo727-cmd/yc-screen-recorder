import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { mkdir, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { EventEmitter } from 'events'
import { powerSaveBlocker } from 'electron'
import { getFFmpegPath } from '../paths'
import { unlinkWithRetry } from '../fs-utils'
import {
  buildFfmpegArgs,
  buildWhisperFfmpegArgs,
  AudioInput,
  SourceMode,
  WebcamConfig,
  TranscriptConfig
} from './ffmpeg-args'
import { VideoEncoder, EncoderQuality } from './encoder-probe'
import { AudioPipe, createAudioPipe } from '../audio-pipes'
import { TranscriptWatcher } from '../stt/transcript-watch'
import { mergeSrts } from '../stt/srt-merge'
import { startClickHighlight, stopClickHighlight } from '../click-highlight'
import { getPreferences } from '../preferences'

export type SessionStatus =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'finalizing'
  | 'error'

export interface SessionState {
  status: SessionStatus
  outputPath?: string
  startedAt?: number // current part's start time (Date.now() ms)
  durationMs?: number // accumulatedMs + (now - startedAt) when recording
  accumulatedMs?: number // sum of completed parts' durations (excludes current part)
  partCount?: number
  error?: string
}

export interface StartSessionInput {
  source: SourceMode
  encoder: VideoEncoder
  encoderQuality: EncoderQuality
  bitrate: string
  outputPath: string // final user-visible path (e.g. rec-TIMESTAMP.mp4)
  audio: { kind: 'system' | 'mic'; channels: number; sampleRate: number; volume: number }[]
  webcam: WebcamConfig | null
  transcript: TranscriptConfig | null
  maxSeconds: number | null
}

interface PartInfo {
  index: number
  mp4Path: string
  srtPath: string | null
  startedAt: number
  endedAt: number | null
}

function partPath(finalPath: string, index: number): string {
  return finalPath.replace(/\.mp4$/i, `-part${String(index).padStart(2, '0')}.mp4`)
}

function srtPartPath(finalPath: string, index: number): string {
  return finalPath.replace(/\.mp4$/i, `-part${String(index).padStart(2, '0')}.srt`)
}

function finalSrtPath(finalPath: string): string {
  return finalPath.replace(/\.mp4$/i, '.srt')
}

export class RecordingSession extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private whisperProc: ChildProcessWithoutNullStreams | null = null
  private state: SessionState = { status: 'idle' }
  private logBuffer: string[] = []
  private pipes: Map<'system' | 'mic', AudioPipe> = new Map()
  private whisperPipes: Map<'system' | 'mic', AudioPipe> = new Map()
  private transcriptWatcher: TranscriptWatcher | null = null

  // Multi-part recording state
  private currentInput: StartSessionInput | null = null
  private parts: PartInfo[] = []
  private currentPart: PartInfo | null = null
  private userStopRequested = false
  private pauseRequested = false
  private psbId: number | null = null

  private acquirePowerSaveBlocker(): void {
    if (this.psbId == null) {
      try {
        // 'prevent-app-suspension' is stronger than 'prevent-display-sleep':
        // it also keeps the process running normally when the screen is
        // off / locked, so scheduled long recordings don't get throttled.
        this.psbId = powerSaveBlocker.start('prevent-app-suspension')
      } catch {
        this.psbId = null
      }
    }
  }

  private releasePowerSaveBlocker(): void {
    if (this.psbId != null) {
      try {
        powerSaveBlocker.stop(this.psbId)
      } catch {
        // ignore
      }
      this.psbId = null
    }
  }

  getState(): SessionState {
    const accumulatedMs = this.parts.reduce(
      (sum, p) => sum + ((p.endedAt ?? p.startedAt) - p.startedAt),
      0
    )
    if (this.state.status === 'recording' && this.currentPart) {
      return {
        ...this.state,
        startedAt: this.currentPart.startedAt,
        accumulatedMs,
        durationMs: accumulatedMs + (Date.now() - this.currentPart.startedAt),
        partCount: this.parts.length + 1
      }
    }
    if (this.state.status === 'paused') {
      return {
        ...this.state,
        accumulatedMs,
        durationMs: accumulatedMs,
        partCount: this.parts.length
      }
    }
    return { ...this.state, accumulatedMs }
  }

  getLogs(): string[] {
    return this.logBuffer.slice(-200)
  }

  writeAudio(kind: 'system' | 'mic', buf: Buffer): void {
    this.pipes.get(kind)?.write(buf)
    this.whisperPipes.get(kind)?.write(buf)
  }

  private pushLog(line: string): void {
    this.logBuffer.push(line)
    if (this.logBuffer.length > 500) this.logBuffer.splice(0, this.logBuffer.length - 500)
    this.emit('log', line)
  }

  async start(input: StartSessionInput): Promise<void> {
    if (this.state.status !== 'idle' && this.state.status !== 'error') {
      throw new Error(`Cannot start: session in ${this.state.status} state`)
    }
    await mkdir(dirname(input.outputPath), { recursive: true })
    this.logBuffer = []
    this.userStopRequested = false
    this.pauseRequested = false
    this.parts = []
    this.currentInput = input
    this.state = { status: 'starting', outputPath: input.outputPath }
    this.emit('state', this.getState())

    await this.spawnPart(1)
  }

  private async spawnPart(partIndex: number): Promise<void> {
    if (!this.currentInput) throw new Error('No currentInput')
    const input = this.currentInput
    const mp4Path = partPath(input.outputPath, partIndex)
    const srtPath = input.transcript ? srtPartPath(input.outputPath, partIndex) : null

    // Recording pipes (main ffmpeg)
    this.pipes.clear()
    const audioInputs: AudioInput[] = []
    for (const a of input.audio) {
      const pipe = await createAudioPipe(`record-${a.kind}-${partIndex}`)
      this.pipes.set(a.kind, pipe)
      audioInputs.push({
        kind: a.kind,
        pipePath: pipe.path,
        channels: a.channels,
        sampleRate: a.sampleRate,
        volume: a.volume
      })
    }

    // Whisper pipes (side ffmpeg)
    this.whisperPipes.clear()
    const whisperAudioInputs: AudioInput[] = []
    if (input.transcript && input.audio.length > 0 && srtPath) {
      for (const a of input.audio) {
        const pipe = await createAudioPipe(`whisper-${a.kind}-${partIndex}`)
        this.whisperPipes.set(a.kind, pipe)
        whisperAudioInputs.push({
          kind: a.kind,
          pipePath: pipe.path,
          channels: a.channels,
          sampleRate: a.sampleRate,
          volume: a.volume
        })
      }
    }

    const args = buildFfmpegArgs({
      source: input.source,
      audio: audioInputs,
      webcam: input.webcam,
      encoder: input.encoder,
      encoderQuality: input.encoderQuality,
      bitrate: input.bitrate,
      outputPath: mp4Path,
      transcript: null,
      maxSeconds: input.maxSeconds
    })
    this.pushLog(`$ ffmpeg [part ${partIndex}] ${args.join(' ')}`)

    const part: PartInfo = {
      index: partIndex,
      mp4Path,
      srtPath,
      startedAt: Date.now(),
      endedAt: null
    }
    this.currentPart = part

    // Watch transcript file for this part
    if (srtPath) {
      const watcher = new TranscriptWatcher(srtPath)
      watcher.on('segment', (seg) => this.emit('transcript', seg))
      this.transcriptWatcher = watcher
      setTimeout(() => watcher.start(), 1500)
    }

    const proc = spawn(getFFmpegPath(), args, { windowsHide: true })
    this.proc = proc
    this.acquirePowerSaveBlocker()
    if (getPreferences().get('clickHighlightEnabled')) {
      try {
        startClickHighlight()
      } catch (e) {
        this.pushLog(`[click-highlight] start failed: ${(e as Error).message}`)
      }
    }

    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (chunk: string) => {
      const lines = chunk.split(/\r?\n/).filter(Boolean)
      for (const line of lines) {
        this.pushLog(line)
        if (this.state.status === 'starting' && /^frame=|^Press \[q\]/.test(line)) {
          this.state = {
            ...this.state,
            status: 'recording',
            startedAt: part.startedAt
          }
          this.emit('state', this.getState())
        }
      }
    })

    proc.on('error', (err) => {
      this.pushLog(`[main] error: ${err.message}`)
    })

    proc.on('exit', (code, signal) => {
      const isClean = code === 0 || code === null || (code === 255 && signal === null)
      // Capture intent flags SYNCHRONOUSLY before any async work — otherwise
      // pause()/stop() may flip them while shutdownWhisper() is pending and
      // we'd misroute control flow.
      const wasPauseRequested = this.pauseRequested
      const wasStopRequested = this.userStopRequested

      part.endedAt = Date.now()
      this.parts.push(part)
      this.currentPart = null
      this.proc = null
      this.releasePowerSaveBlocker()
      stopClickHighlight()
      void this.closePipes()
      this.transcriptWatcher?.stop()
      this.transcriptWatcher = null

      if (!isClean) {
        this.state = {
          status: 'error',
          outputPath: this.currentInput?.outputPath,
          durationMs: this.getState().durationMs,
          error: `ffmpeg part ${part.index} exited with code ${code}`
        }
        this.emit('state', this.getState())
        return
      }

      // Stop whisper side proc for this part (drain), then decide next step
      void this.shutdownWhisper().then(() => {
        if (wasPauseRequested) {
          // pause() flow handles the transition to 'paused' itself
          return
        }
        if (wasStopRequested) {
          // stop() flow handles finalize itself
          return
        }
        // Otherwise this was an auto-split (maxSeconds hit) - finalize and emit
        void this.finalizeAndEmit(true)
      })
    })

    // Whisper side proc
    if (input.transcript && whisperAudioInputs.length > 0) {
      const transcriptForPart: TranscriptConfig = { ...input.transcript, destination: srtPath! }
      const wargs = buildWhisperFfmpegArgs(whisperAudioInputs, transcriptForPart)
      this.pushLog(`$ ffmpeg (whisper part ${partIndex}) ${wargs.join(' ')}`)
      const wproc = spawn(getFFmpegPath(), wargs, { windowsHide: true })
      this.whisperProc = wproc
      wproc.stderr.setEncoding('utf8')
      wproc.stderr.on('data', (chunk: string) => {
        const lines = chunk.split(/\r?\n/).filter(Boolean)
        for (const line of lines) this.pushLog(`[whisper] ${line}`)
      })
      wproc.on('error', (err) => {
        this.pushLog(`[whisper] error: ${err.message}`)
        this.whisperProc = null
      })
      wproc.on('exit', (code) => {
        this.pushLog(`[whisper] part ${partIndex} exit code=${code}`)
        this.whisperProc = null
      })
    }
  }

  async pause(): Promise<void> {
    if (this.state.status !== 'recording' || !this.proc) return
    this.pauseRequested = true
    this.state = { ...this.state, status: 'stopping' } // transient — we'll set to paused after exit
    this.emit('state', this.getState())

    try {
      this.proc.stdin.write('q')
    } catch {
      // ignore
    }
    await this.waitForProcExit(60_000)
    this.pauseRequested = false
    this.state = {
      ...this.state,
      status: 'paused',
      durationMs: this.getState().durationMs,
      partCount: this.parts.length
    }
    this.emit('state', this.getState())
  }

  async resume(): Promise<void> {
    if (this.state.status !== 'paused' || !this.currentInput) return
    this.state = { ...this.state, status: 'starting' }
    this.emit('state', this.getState())
    await this.spawnPart(this.parts.length + 1)
  }

  async stop(): Promise<void> {
    if (this.state.status === 'idle' || this.state.status === 'error') return
    this.userStopRequested = true

    if (this.proc && (this.state.status === 'recording' || this.state.status === 'starting')) {
      this.state = { ...this.state, status: 'stopping' }
      this.emit('state', this.getState())
      try {
        this.proc.stdin.write('q')
      } catch {
        // ignore
      }
      await this.waitForProcExit(60_000)
    }

    // At this point, proc has exited and current part is in this.parts (via exit handler).
    // Drain whisper if still running.
    await this.shutdownWhisper()
    await this.finalizeAndEmit(false)
  }

  private async waitForProcExit(timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.proc) return resolve()
      const t = setTimeout(() => {
        if (this.proc) {
          this.pushLog('[session] main stop timeout exceeded, sending SIGKILL')
          this.proc.kill('SIGKILL')
        }
        resolve()
      }, timeoutMs)
      this.proc.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }

  private async finalizeAndEmit(autoSplit: boolean): Promise<void> {
    if (!this.currentInput) {
      this.state = { status: 'idle' }
      this.emit('state', this.getState())
      return
    }
    const input = this.currentInput
    this.state = { ...this.state, status: 'finalizing' }
    this.emit('state', this.getState())

    let finalMp4 = input.outputPath
    let finalSrt: string | null = null
    try {
      if (this.parts.length === 0) {
        this.pushLog('[finalize] no parts recorded')
      } else if (this.parts.length === 1) {
        // Rename single part to final path
        const single = this.parts[0]
        await rename(single.mp4Path, input.outputPath).catch(async (e) => {
          this.pushLog(`[finalize] rename failed (${e.message}); leaving as-is`)
          finalMp4 = single.mp4Path
        })
        if (single.srtPath) {
          finalSrt = finalSrtPath(input.outputPath)
          await rename(single.srtPath, finalSrt).catch(() => {
            finalSrt = single.srtPath
          })
        }
      } else {
        // Concat multiple parts
        await this.concatParts(this.parts.map((p) => p.mp4Path), input.outputPath)
        for (const p of this.parts) await unlinkWithRetry(p.mp4Path)

        if (this.parts.some((p) => p.srtPath)) {
          finalSrt = finalSrtPath(input.outputPath)
          await mergeSrts(
            this.parts
              .filter((p) => p.srtPath)
              .map((p) => ({
                srtPath: p.srtPath as string,
                durationMs: (p.endedAt ?? p.startedAt) - p.startedAt
              })),
            finalSrt
          ).catch((e) => {
            this.pushLog(`[finalize] srt merge failed: ${(e as Error).message}`)
            finalSrt = null
          })
        }
      }
    } catch (e) {
      this.pushLog(`[finalize] error: ${(e as Error).message}`)
      this.state = {
        status: 'error',
        outputPath: input.outputPath,
        error: (e as Error).message
      }
      this.emit('state', this.getState())
      return
    }

    const totalMs = this.parts.reduce(
      (sum, p) => sum + ((p.endedAt ?? p.startedAt) - p.startedAt),
      0
    )

    this.state = {
      status: 'idle',
      outputPath: finalMp4,
      durationMs: totalMs
    }
    this.emit('state', this.getState())
    this.emit('finished', {
      outputPath: finalMp4,
      durationMs: totalMs,
      transcriptPath: finalSrt,
      autoSplit
    })

    this.currentInput = null
    this.parts = []
  }

  private concatParts(parts: string[], output: string): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      const listPath = `${output}.concat.txt`
      const content = parts
        .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
        .join('\n')
      await writeFile(listPath, content, 'utf8')
      this.pushLog(`[concat] merging ${parts.length} parts → ${output}`)
      const proc = spawn(
        getFFmpegPath(),
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-c',
          'copy',
          output
        ],
        { windowsHide: true }
      )
      proc.stderr.setEncoding('utf8')
      proc.stderr.on('data', (chunk: string) => {
        const lines = chunk.split(/\r?\n/).filter(Boolean)
        for (const line of lines) this.pushLog(`[concat] ${line}`)
      })
      proc.on('exit', async (code) => {
        await unlinkWithRetry(listPath)
        if (code === 0) resolve()
        else reject(new Error(`concat ffmpeg exited with code ${code}`))
      })
      proc.on('error', reject)
    })
  }

  private async shutdownWhisper(): Promise<void> {
    const wp = this.whisperProc
    if (!wp) {
      // Still close pipes if any
      for (const pipe of this.whisperPipes.values()) await pipe.close().catch(() => {})
      this.whisperPipes.clear()
      return
    }
    try {
      wp.stdin.write('q')
    } catch {
      // ignore
    }
    for (const pipe of this.whisperPipes.values()) await pipe.close().catch(() => {})
    this.whisperPipes.clear()
    await new Promise<void>((resolve) => {
      if (!this.whisperProc) return resolve()
      const t = setTimeout(() => {
        if (this.whisperProc) {
          this.pushLog('[whisper] stop timeout, SIGKILL')
          this.whisperProc.kill('SIGKILL')
        }
        resolve()
      }, 30_000)
      this.whisperProc.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }

  private async closePipes(): Promise<void> {
    const all = Array.from(this.pipes.values())
    this.pipes.clear()
    await Promise.allSettled(all.map((p) => p.close()))
  }
}

export const session = new RecordingSession()
