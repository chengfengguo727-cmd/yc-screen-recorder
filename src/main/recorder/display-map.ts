import { screen, desktopCapturer } from 'electron'
import { execFile } from 'child_process'
import { getFFmpegPath } from '../paths'
import { getPreferences } from '../preferences'

export interface DisplayMapping {
  displayId: number
  outputIdx: number
  bounds: { x: number; y: number; width: number; height: number }
  isPrimary: boolean
  label: string
  scaleFactor: number
  /** Panel refresh rate in Hz. ddagrab only paces cleanly when asked for this
   *  exact rate, so the capture rate is derived from it (see ffmpeg-args). */
  refreshHz: number
  /** true when the user pinned this output index by hand */
  manual: boolean
}

interface Probe {
  outputIdx: number
  width: number
  height: number
  /** SAMPLE_W * SAMPLE_H grayscale thumbnail, or null if the grab failed */
  thumb: Uint8Array | null
}

let cached: DisplayMapping[] | null = null

// Screens are matched by comparing downscaled grayscale thumbnails. Average
// colour alone is not enough: two dark trading screens have nearly identical
// average colour but completely different layouts. Per-pixel comparison
// separates them by ~10x in practice.
const SAMPLE_W = 32
const SAMPLE_H = 18

function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return Number.POSITIVE_INFINITY
  let sum = 0
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i])
  return sum / n
}

/** Grab one frame from a ddagrab output as a small grayscale thumbnail. */
function probeDdagrabFrame(outputIdx: number): Promise<Probe | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let stderr = ''
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
        '-vf',
        `hwdownload,format=bgra,scale=${SAMPLE_W}:${SAMPLE_H},format=gray`,
        '-pix_fmt',
        'gray',
        '-f',
        'rawvideo',
        '-'
      ],
      { timeout: 8000, encoding: 'buffer' },
      () => {
        // resolved in 'close'
      }
    )
    child.stdout?.on('data', (c: Buffer) => chunks.push(c))
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString()
    })
    child.on('error', () => resolve(null))
    child.on('close', () => {
      const m = /Stream.*Video.*?(\d{2,5})x(\d{2,5})/.exec(stderr)
      if (!m) return resolve(null)
      const buf = Buffer.concat(chunks)
      const need = SAMPLE_W * SAMPLE_H
      resolve({
        outputIdx,
        width: parseInt(m[1], 10),
        height: parseInt(m[2], 10),
        thumb: buf.length >= need ? new Uint8Array(buf.subarray(0, need)) : null
      })
    })
  })
}

/**
 * Grayscale thumbnails keyed by Electron display id. desktopCapturer's
 * display_id is authoritative, so these are the reference images that the
 * ddagrab probes get matched against.
 */
async function displayThumbnails(): Promise<Map<number, Uint8Array>> {
  const result = new Map<number, Uint8Array>()
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: SAMPLE_W * 8, height: SAMPLE_H * 8 }
    })
    for (const s of sources) {
      const id = Number(s.display_id)
      if (!Number.isFinite(id) || s.thumbnail.isEmpty()) continue
      // Passing both dimensions stretches to exactly SAMPLE_W x SAMPLE_H,
      // matching how ffmpeg's scale filter treats the ddagrab frame.
      const bmp = s.thumbnail.resize({ width: SAMPLE_W, height: SAMPLE_H }).toBitmap()
      const px = SAMPLE_W * SAMPLE_H
      if (bmp.length < px * 4) continue
      const gray = new Uint8Array(px)
      for (let i = 0; i < px; i++) {
        const b = bmp[i * 4]
        const g = bmp[i * 4 + 1]
        const r = bmp[i * 4 + 2]
        gray[i] = (r * 299 + g * 587 + b * 114) / 1000
      }
      result.set(id, gray)
    }
  } catch (e) {
    console.warn('displayThumbnails failed', e)
  }
  return result
}

export async function buildDisplayMap(force = false): Promise<DisplayMapping[]> {
  if (cached && !force) return cached
  const displays = screen.getAllDisplays()
  const primaryId = screen.getPrimaryDisplay().id
  const overrides = getPreferences().get('displayOutputOverrides') ?? {}

  const probes: Probe[] = []
  for (let i = 0; i < displays.length + 2; i++) {
    const p = await probeDdagrabFrame(i)
    if (!p) break
    probes.push(p)
  }

  const refThumbs = await displayThumbnails()

  const physical = (d: Electron.Display): { w: number; h: number } => ({
    w: Math.round(d.bounds.width * d.scaleFactor),
    h: Math.round(d.bounds.height * d.scaleFactor)
  })

  const assigned = new Map<number, number>() // displayId -> outputIdx
  const usedOutputs = new Set<number>()

  // 1. Manual overrides win outright.
  for (const d of displays) {
    const forced = overrides[String(d.id)]
    if (typeof forced === 'number' && !usedOutputs.has(forced)) {
      assigned.set(d.id, forced)
      usedOutputs.add(forced)
    }
  }

  // 2. Score every remaining (display, output) pair that agrees on resolution,
  //    then assign globally best-first so one display can't steal another's
  //    obvious match just by being earlier in the list.
  const scored: { displayId: number; outputIdx: number; score: number }[] = []
  for (const d of displays) {
    if (assigned.has(d.id)) continue
    const { w, h } = physical(d)
    const ref = refThumbs.get(d.id)
    for (const p of probes) {
      if (usedOutputs.has(p.outputIdx)) continue
      if (p.width !== w || p.height !== h) continue
      const score = ref && p.thumb ? meanAbsDiff(ref, p.thumb) : Number.POSITIVE_INFINITY
      scored.push({ displayId: d.id, outputIdx: p.outputIdx, score })
    }
  }
  scored.sort((a, b) => a.score - b.score)
  for (const s of scored) {
    if (assigned.has(s.displayId) || usedOutputs.has(s.outputIdx)) continue
    assigned.set(s.displayId, s.outputIdx)
    usedOutputs.add(s.outputIdx)
  }

  // 3. Anything still unmatched (resolution not found among probes) falls back
  //    to the first free output index.
  const mapping: DisplayMapping[] = displays.map((d, idx) => {
    let outputIdx = assigned.get(d.id)
    if (outputIdx === undefined) {
      outputIdx = probes.find((p) => !usedOutputs.has(p.outputIdx))?.outputIdx ?? idx
      usedOutputs.add(outputIdx)
      assigned.set(d.id, outputIdx)
    }
    const { w, h } = physical(d)
    return {
      displayId: d.id,
      outputIdx,
      bounds: { ...d.bounds },
      isPrimary: d.id === primaryId,
      label: `Display ${idx + 1}${d.id === primaryId ? ' (Primary)' : ''} — ${w}×${h}`,
      scaleFactor: d.scaleFactor,
      refreshHz: Math.round(d.displayFrequency) || 60,
      manual: typeof overrides[String(d.id)] === 'number'
    }
  })

  cached = mapping
  return mapping
}

/** Number of ddagrab outputs detected on this machine (for the manual picker). */
export async function countDdagrabOutputs(): Promise<number> {
  const maps = await buildDisplayMap()
  return Math.max(maps.length, ...maps.map((m) => m.outputIdx + 1))
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
