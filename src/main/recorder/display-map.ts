import { screen } from 'electron'
import { execFile } from 'child_process'
import { getFFmpegPath } from '../paths'

export interface DisplayMapping {
  displayId: number
  outputIdx: number
  bounds: { x: number; y: number; width: number; height: number }
  isPrimary: boolean
  label: string
  scaleFactor: number
}

let cached: DisplayMapping[] | null = null

function probeDdagrabSize(outputIdx: number): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const child = execFile(
      getFFmpegPath(),
      [
        '-hide_banner',
        '-f',
        'lavfi',
        '-i',
        `ddagrab=output_idx=${outputIdx}:framerate=1`,
        '-frames:v',
        '1',
        '-f',
        'null',
        '-'
      ],
      { timeout: 5000 },
      (_err, _stdout, stderr) => {
        const m = /Stream.*Video.*?(\d{2,5})x(\d{2,5})/.exec(stderr || '')
        if (m) resolve({ width: parseInt(m[1], 10), height: parseInt(m[2], 10) })
        else resolve(null)
      }
    )
    child.on('error', () => resolve(null))
  })
}

export async function buildDisplayMap(force = false): Promise<DisplayMapping[]> {
  if (cached && !force) return cached
  const displays = screen.getAllDisplays()
  const primaryId = screen.getPrimaryDisplay().id

  const probes: { outputIdx: number; size: { width: number; height: number } | null }[] = []
  for (let i = 0; i < displays.length + 1; i++) {
    const size = await probeDdagrabSize(i)
    if (!size) break
    probes.push({ outputIdx: i, size })
  }

  const used = new Set<number>()
  const mapping: DisplayMapping[] = displays.map((d, idx) => {
    const physical = {
      width: Math.round(d.bounds.width * d.scaleFactor),
      height: Math.round(d.bounds.height * d.scaleFactor)
    }
    let outputIdx = probes.findIndex(
      (p, i) => !used.has(i) && p.size!.width === physical.width && p.size!.height === physical.height
    )
    if (outputIdx === -1) outputIdx = idx
    used.add(outputIdx)
    return {
      displayId: d.id,
      outputIdx,
      bounds: { ...d.bounds },
      isPrimary: d.id === primaryId,
      label: `Display ${idx + 1}${d.id === primaryId ? ' (Primary)' : ''} — ${physical.width}×${physical.height}`,
      scaleFactor: d.scaleFactor
    }
  })

  cached = mapping
  return mapping
}

export function virtualDesktopBounds(maps: DisplayMapping[]): {
  width: number
  height: number
} {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const m of maps) {
    const physW = Math.round(m.bounds.width * m.scaleFactor)
    const physH = Math.round(m.bounds.height * m.scaleFactor)
    minX = Math.min(minX, m.bounds.x)
    minY = Math.min(minY, m.bounds.y)
    maxX = Math.max(maxX, m.bounds.x + physW)
    maxY = Math.max(maxY, m.bounds.y + physH)
  }
  return { width: maxX - minX, height: maxY - minY }
}
