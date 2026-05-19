import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import { getFFmpegPath, getFFprobePath } from './paths'
import { probeEncoders, encoderArgs } from './recorder/encoder-probe'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface BurnOptions {
  inputMp4: string
  inputSrt: string
  outputMp4: string
  fontName: string
  fontSize: number
  outline: number
  shadow: number
  bitrate: string
}

export interface BurnProgress {
  jobId: string
  outTimeUs: number
  totalUs: number
  percent: number
  speed: string
  fps: string
}

function escapeSubsPath(p: string): string {
  // libass subtitles filter on Windows: forward slashes, double-escape colon
  return p.replace(/\\/g, '/').replace(/:/g, '\\\\:')
}

async function probeDurationUs(mp4Path: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(getFFprobePath(), [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      mp4Path
    ])
    const sec = parseFloat(stdout.trim())
    return Number.isFinite(sec) ? Math.round(sec * 1_000_000) : 0
  } catch {
    return 0
  }
}

export class BurnInJob extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private cancelled = false
  public readonly jobId: string

  constructor(jobId: string) {
    super()
    this.jobId = jobId
  }

  async run(opts: BurnOptions): Promise<void> {
    if (!existsSync(opts.inputMp4)) throw new Error(`找不到輸入影片：${opts.inputMp4}`)
    if (!existsSync(opts.inputSrt)) throw new Error(`找不到 SRT 字幕：${opts.inputSrt}`)
    const totalUs = await probeDurationUs(opts.inputMp4)

    const encs = await probeEncoders()
    const encoder = encs.preferred

    const style = [
      `Fontname=${opts.fontName}`,
      `Fontsize=${opts.fontSize}`,
      'PrimaryColour=&Hffffff',
      'OutlineColour=&H000000',
      'BackColour=&H80000000',
      'BorderStyle=1',
      `Outline=${opts.outline}`,
      `Shadow=${opts.shadow}`,
      'Alignment=2',
      'MarginV=40'
    ].join(',')

    const filter = `subtitles=${escapeSubsPath(opts.inputSrt)}:force_style='${style}'`

    const args: string[] = [
      '-hide_banner',
      '-y',
      '-i',
      opts.inputMp4,
      '-vf',
      filter,
      ...encoderArgs(encoder, opts.bitrate),
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'copy',
      '-progress',
      'pipe:1',
      '-nostats',
      opts.outputMp4
    ]

    this.emit('log', `$ ffmpeg ${args.join(' ')}`)

    return new Promise<void>((resolve, reject) => {
      const proc = spawn(getFFmpegPath(), args, { windowsHide: true })
      this.proc = proc

      // Progress info is on stdout (from -progress pipe:1)
      let progressBuf = ''
      proc.stdout.setEncoding('utf8')
      proc.stdout.on('data', (chunk: string) => {
        progressBuf += chunk
        const lines = progressBuf.split('\n')
        progressBuf = lines.pop() ?? ''
        const kv: Record<string, string> = {}
        let endOfChunk = false
        for (const raw of lines) {
          const line = raw.trim()
          if (!line) continue
          const idx = line.indexOf('=')
          if (idx === -1) continue
          const key = line.slice(0, idx).trim()
          const val = line.slice(idx + 1).trim()
          kv[key] = val
          if (key === 'progress') endOfChunk = true
        }
        if (endOfChunk && Object.keys(kv).length > 0) {
          const outTimeUs = Number(kv['out_time_us'] ?? kv['out_time_ms'] ?? 0)
          const percent = totalUs > 0 ? Math.min(100, (outTimeUs / totalUs) * 100) : 0
          this.emit('progress', {
            jobId: this.jobId,
            outTimeUs,
            totalUs,
            percent,
            speed: kv['speed'] ?? '',
            fps: kv['fps'] ?? ''
          } satisfies BurnProgress)
        }
      })

      proc.stderr.setEncoding('utf8')
      proc.stderr.on('data', (chunk: string) => {
        const lines = chunk.split(/\r?\n/).filter(Boolean)
        for (const line of lines) this.emit('log', `[burn] ${line}`)
      })

      proc.on('error', (err) => {
        this.proc = null
        reject(err)
      })

      proc.on('exit', (code, signal) => {
        this.proc = null
        if (this.cancelled) {
          reject(new Error('cancelled'))
          return
        }
        if (code === 0) resolve()
        else reject(new Error(`burn-in ffmpeg exited with code ${code} (signal=${signal})`))
      })
    })
  }

  cancel(): void {
    this.cancelled = true
    if (this.proc) {
      try {
        this.proc.stdin.write('q')
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (this.proc) this.proc.kill('SIGKILL')
      }, 5000)
    }
  }
}
