import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { EventEmitter } from 'events'
import { getFFmpegPath, getFFprobePath } from './paths'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { parseSrt } from './stt/transcript-watch'

const execFileAsync = promisify(execFile)

export interface TrimOptions {
  inputMp4: string
  inputSrt: string | null
  outputMp4: string
  outputSrt: string | null
  startSec: number
  endSec: number
  reencode: boolean // false = stream copy (fast, keyframe-aligned); true = exact cut
}

export interface TrimProgress {
  jobId: string
  outTimeUs: number
  totalUs: number
  percent: number
}

async function probeDurationUs(p: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(getFFprobePath(), [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      p
    ])
    const sec = parseFloat(stdout.trim())
    return Number.isFinite(sec) ? Math.round(sec * 1_000_000) : 0
  } catch {
    return 0
  }
}

function formatSrtTime(totalSec: number): string {
  const ms = Math.max(0, Math.round(totalSec * 1000))
  const h = Math.floor(ms / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const milli = ms % 1000
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`
}

async function trimSrt(
  inPath: string,
  outPath: string,
  startSec: number,
  endSec: number
): Promise<void> {
  const content = await readFile(inPath, 'utf8').catch(() => '')
  const segs = parseSrt(content)
  const lines: string[] = []
  let idx = 1
  for (const seg of segs) {
    // Keep segments that overlap the trim window
    if (seg.end <= startSec) continue
    if (seg.start >= endSec) continue
    const adjStart = Math.max(0, seg.start - startSec)
    const adjEnd = Math.min(endSec - startSec, seg.end - startSec)
    if (adjEnd <= adjStart) continue
    lines.push(String(idx))
    lines.push(`${formatSrtTime(adjStart)} --> ${formatSrtTime(adjEnd)}`)
    lines.push(seg.text)
    lines.push('')
    idx++
  }
  await writeFile(outPath, lines.join('\n'), 'utf8')
}

export class TrimJob extends EventEmitter {
  private proc: ReturnType<typeof spawn> | null = null
  private cancelled = false
  public readonly jobId: string

  constructor(jobId: string) {
    super()
    this.jobId = jobId
  }

  async run(opts: TrimOptions): Promise<void> {
    if (!existsSync(opts.inputMp4)) throw new Error(`找不到輸入影片：${opts.inputMp4}`)
    if (opts.endSec <= opts.startSec) throw new Error('結束時間必須大於開始時間')

    const durationUs = await probeDurationUs(opts.inputMp4)
    const totalUs = Math.max(0, Math.round((opts.endSec - opts.startSec) * 1_000_000))
    if (durationUs > 0 && opts.endSec * 1_000_000 > durationUs + 500_000) {
      throw new Error(`結束時間超出影片長度`)
    }

    // Build args. For stream-copy: place -ss before -i (fast seek to keyframe).
    // For re-encode (accurate cut): use -ss after -i to get sample-accurate cut, plus -t for duration.
    let args: string[]
    if (opts.reencode) {
      args = [
        '-hide_banner',
        '-y',
        '-i',
        opts.inputMp4,
        '-ss',
        String(opts.startSec),
        '-to',
        String(opts.endSec),
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '20',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-pix_fmt',
        'yuv420p',
        '-progress',
        'pipe:1',
        '-nostats',
        opts.outputMp4
      ]
    } else {
      args = [
        '-hide_banner',
        '-y',
        '-ss',
        String(opts.startSec),
        '-to',
        String(opts.endSec),
        '-i',
        opts.inputMp4,
        '-c',
        'copy',
        '-avoid_negative_ts',
        'make_zero',
        '-progress',
        'pipe:1',
        '-nostats',
        opts.outputMp4
      ]
    }

    this.emit('log', `$ ffmpeg ${args.join(' ')}`)

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(getFFmpegPath(), args, { windowsHide: true })
      this.proc = proc

      let progressBuf = ''
      proc.stdout?.setEncoding('utf8')
      proc.stdout?.on('data', (chunk: string) => {
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
        if (endOfChunk) {
          const outTimeUs = Number(kv['out_time_us'] ?? kv['out_time_ms'] ?? 0)
          const percent = totalUs > 0 ? Math.min(100, (outTimeUs / totalUs) * 100) : 0
          this.emit('progress', {
            jobId: this.jobId,
            outTimeUs,
            totalUs,
            percent
          } satisfies TrimProgress)
        }
      })

      proc.stderr?.setEncoding('utf8')
      proc.stderr?.on('data', (chunk: string) => {
        const lines = chunk.split(/\r?\n/).filter(Boolean)
        for (const line of lines) this.emit('log', `[trim] ${line}`)
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
        else reject(new Error(`trim ffmpeg exited with code ${code} (signal=${signal})`))
      })
    })

    // Trim SRT if provided
    if (opts.inputSrt && opts.outputSrt && existsSync(opts.inputSrt)) {
      try {
        await trimSrt(opts.inputSrt, opts.outputSrt, opts.startSec, opts.endSec)
      } catch (e) {
        this.emit('log', `[trim] srt trim failed: ${(e as Error).message}`)
      }
    }
  }

  cancel(): void {
    this.cancelled = true
    if (this.proc) {
      try {
        this.proc.stdin?.write('q')
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (this.proc) this.proc.kill('SIGKILL')
      }, 5000)
    }
  }
}
