import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { parseSrt } from './transcript-watch'
import { unlinkWithRetry } from '../fs-utils'

function formatSrtTime(totalSec: number): string {
  const ms = Math.max(0, Math.round(totalSec * 1000))
  const h = Math.floor(ms / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const milli = ms % 1000
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`
}

export interface SrtPart {
  srtPath: string
  durationMs: number
}

/**
 * Merge multiple SRT files into one, offsetting each by cumulative duration.
 * Deletes individual SRT files on success.
 */
export async function mergeSrts(parts: SrtPart[], outputPath: string): Promise<void> {
  const lines: string[] = []
  let idx = 1
  let cumulativeSec = 0
  for (const part of parts) {
    if (!existsSync(part.srtPath)) {
      cumulativeSec += part.durationMs / 1000
      continue
    }
    const content = await readFile(part.srtPath, 'utf8').catch(() => '')
    const segs = parseSrt(content)
    for (const seg of segs) {
      lines.push(String(idx))
      lines.push(`${formatSrtTime(seg.start + cumulativeSec)} --> ${formatSrtTime(seg.end + cumulativeSec)}`)
      lines.push(seg.text)
      lines.push('')
      idx++
    }
    cumulativeSec += part.durationMs / 1000
  }
  await writeFile(outputPath, lines.join('\n'), 'utf8')
  for (const part of parts) {
    if (part.srtPath && part.srtPath !== outputPath) {
      await unlinkWithRetry(part.srtPath)
    }
  }
}
