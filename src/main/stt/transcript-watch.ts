import { watch, FSWatcher } from 'fs'
import { readFile } from 'fs/promises'
import { EventEmitter } from 'events'

export interface TranscriptSegment {
  index: number
  start: number
  end: number
  text: string
}

function parseSrtTime(s: string): number {
  const m = /^(\d+):(\d+):(\d+)[,.](\d+)$/.exec(s.trim())
  if (!m) return 0
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000
}

export function parseSrt(content: string): TranscriptSegment[] {
  const blocks = content.replace(/\r\n/g, '\n').split(/\n\n+/)
  const segments: TranscriptSegment[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length > 0)
    if (lines.length < 2) continue
    const idx = Number(lines[0])
    const timeMatch = /^(\S+)\s*-->\s*(\S+)/.exec(lines[1])
    if (!timeMatch || Number.isNaN(idx)) continue
    const start = parseSrtTime(timeMatch[1])
    const end = parseSrtTime(timeMatch[2])
    const text = lines.slice(2).join('\n').trim()
    segments.push({ index: idx, start, end, text })
  }
  return segments
}

export class TranscriptWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private lastCount = 0
  private debounce: NodeJS.Timeout | null = null
  private path: string
  private pollTimer: NodeJS.Timeout | null = null
  private stopped = false

  constructor(srtPath: string) {
    super()
    this.path = srtPath
  }

  start(): void {
    if (this.stopped) return
    try {
      this.watcher = watch(this.path, { persistent: false }, () => {
        if (this.debounce) clearTimeout(this.debounce)
        this.debounce = setTimeout(() => void this.read(), 200)
      })
    } catch {
      // file may not exist yet; retry after small delay
      setTimeout(() => this.start(), 500)
    }
    // belt-and-braces polling in case fs.watch misses events on Windows
    this.pollTimer = setInterval(() => void this.read(), 1000)
  }

  private async read(): Promise<void> {
    try {
      const content = await readFile(this.path, 'utf8')
      const segments = parseSrt(content)
      if (segments.length > this.lastCount) {
        const newOnes = segments.slice(this.lastCount)
        this.lastCount = segments.length
        for (const seg of newOnes) this.emit('segment', seg)
      }
    } catch {
      // ignore transient errors
    }
  }

  stop(): void {
    this.stopped = true
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = null
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    try {
      this.watcher?.close()
    } catch {
      // ignore
    }
    this.watcher = null
    void this.read()
  }
}
