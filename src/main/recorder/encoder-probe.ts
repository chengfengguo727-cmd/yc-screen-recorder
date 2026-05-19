import { execFile } from 'child_process'
import { promisify } from 'util'
import { getFFmpegPath } from '../paths'

const execFileAsync = promisify(execFile)

export type VideoEncoder = 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'libx264'

export type EncoderQuality = 'speed' | 'balanced' | 'quality'

export interface EncoderCapabilities {
  preferred: VideoEncoder
  available: VideoEncoder[]
}

let cached: EncoderCapabilities | null = null

const PRIORITY: VideoEncoder[] = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264']

function runtimeTest(encoder: VideoEncoder): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      getFFmpegPath(),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'nullsrc=s=320x240:r=10',
        '-frames:v',
        '3',
        '-c:v',
        encoder,
        '-f',
        'null',
        '-'
      ],
      { timeout: 6000 },
      (err) => resolve(!err)
    )
  })
}

export async function probeEncoders(force = false): Promise<EncoderCapabilities> {
  if (cached && !force) return cached
  const { stdout } = await execFileAsync(getFFmpegPath(), ['-hide_banner', '-encoders'], {
    maxBuffer: 8 * 1024 * 1024
  })
  const listed = PRIORITY.filter((enc) => stdout.includes(enc))
  const available: VideoEncoder[] = []
  for (const enc of listed) {
    if (await runtimeTest(enc)) available.push(enc)
  }
  if (available.length === 0) {
    throw new Error('No usable H.264 encoder. Tried: ' + listed.join(', '))
  }
  cached = { preferred: available[0], available }
  return cached
}

function bitrateToKbps(b: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([KM]?)$/i.exec(b.trim())
  if (!m) return 6000
  const num = parseFloat(m[1])
  const unit = (m[2] || 'K').toUpperCase()
  return unit === 'M' ? Math.max(1, Math.round(num * 1000)) : Math.max(1, Math.round(num))
}

export function encoderArgs(
  encoder: VideoEncoder,
  bitrate = '12M',
  quality: EncoderQuality = 'balanced'
): string[] {
  const kbps = bitrateToKbps(bitrate)
  const bufsize = `${kbps * 2}K`

  switch (encoder) {
    case 'h264_nvenc': {
      // p1 fastest .. p7 slowest. Higher = better compression at same bitrate.
      // multipass + spatial AQ + look-ahead help LOW-bitrate quality the most.
      if (quality === 'speed') {
        return [
          '-c:v', 'h264_nvenc',
          '-preset', 'p3',
          '-tune', 'hq',
          '-rc', 'vbr',
          '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize
        ]
      }
      if (quality === 'quality') {
        // Just bump the preset (p5 → p7). Adding multipass / spatial-aq /
        // temporal-aq / bf / refs cause "No capable devices found" or
        // "Invalid argument" on some NVENC versions. Preset alone gives most
        // of the quality improvement.
        return [
          '-c:v', 'h264_nvenc',
          '-preset', 'p7',
          '-tune', 'hq',
          '-rc', 'vbr',
          '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize
        ]
      }
      // balanced — same minimal options as v1.6.0 (proven to work)
      return [
        '-c:v', 'h264_nvenc',
        '-preset', 'p5',
        '-tune', 'hq',
        '-rc', 'vbr',
        '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize
      ]
    }
    case 'h264_qsv': {
      if (quality === 'speed') {
        return ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize]
      }
      if (quality === 'quality') {
        return ['-c:v', 'h264_qsv', '-preset', 'slower', '-look_ahead', '1', '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize]
      }
      return ['-c:v', 'h264_qsv', '-preset', 'medium', '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize]
    }
    case 'h264_amf': {
      if (quality === 'speed') {
        return ['-c:v', 'h264_amf', '-quality', 'speed', '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize]
      }
      if (quality === 'quality') {
        return ['-c:v', 'h264_amf', '-quality', 'quality', '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize]
      }
      return ['-c:v', 'h264_amf', '-quality', 'balanced', '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize]
    }
    case 'libx264': {
      // libx264 preset speed → compression: ultrafast .. placebo
      if (quality === 'speed') {
        return [
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize
        ]
      }
      if (quality === 'quality') {
        return [
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-profile:v', 'high',
          '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize
        ]
      }
      // balanced
      return [
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bufsize
      ]
    }
  }
}
