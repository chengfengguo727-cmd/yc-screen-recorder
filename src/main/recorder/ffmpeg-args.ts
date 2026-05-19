import { encoderArgs, VideoEncoder, EncoderQuality } from './encoder-probe'
import { DisplayMapping } from './display-map'

export type SourceMode =
  | { kind: 'display'; outputIdx: number; drawMouse: boolean; framerate: number }
  | {
      kind: 'region'
      outputIdx: number
      offsetX: number
      offsetY: number
      width: number
      height: number
      drawMouse: boolean
      framerate: number
    }
  | { kind: 'virtual-desktop'; mappings: DisplayMapping[]; drawMouse: boolean; framerate: number }

export interface AudioInput {
  kind: 'system' | 'mic'
  pipePath: string
  channels: number
  sampleRate: number
  volume: number
}

export interface TranscriptConfig {
  modelPath: string
  destination: string
  language: string
  queueSeconds: number
}

export type PipPosition = 'tl' | 'tr' | 'bl' | 'br'

export interface WebcamConfig {
  deviceName: string
  position: PipPosition
  widthRatio: number
  framerate: number
}

export interface RecordingConfig {
  source: SourceMode
  audio: AudioInput[]
  webcam: WebcamConfig | null
  encoder: VideoEncoder
  encoderQuality: EncoderQuality
  bitrate: string
  outputPath: string
  transcript: TranscriptConfig | null
  maxSeconds: number | null // null = no limit; if set, ffmpeg gets -t and exits cleanly
}

function escapeFilterValue(s: string): string {
  return s.replace(/\\/g, '/').replace(/:/g, '\\\\:').replace(/'/g, "\\\\'")
}

function ddagrabInput(
  outputIdx: number,
  drawMouse: boolean,
  framerate: number,
  region?: { x: number; y: number; w: number; h: number }
): string {
  const parts = [`output_idx=${outputIdx}`, `framerate=${framerate}`, `draw_mouse=${drawMouse ? 1 : 0}`]
  if (region) {
    parts.push(`offset_x=${region.x}`, `offset_y=${region.y}`, `video_size=${region.w}x${region.h}`)
  }
  return parts.join(':')
}

function pipOverlayCoords(pos: PipPosition): string {
  const margin = 24
  switch (pos) {
    case 'tl':
      return `${margin}:${margin}`
    case 'tr':
      return `W-w-${margin}:${margin}`
    case 'bl':
      return `${margin}:H-h-${margin}`
    case 'br':
    default:
      return `W-w-${margin}:H-h-${margin}`
  }
}

export function buildFfmpegArgs(cfg: RecordingConfig): string[] {
  const args: string[] = ['-hide_banner', '-loglevel', 'info', '-y']

  let screenChain: string
  let videoInputCount = 0

  if (cfg.source.kind === 'display') {
    args.push(
      '-f',
      'lavfi',
      '-i',
      `ddagrab=${ddagrabInput(cfg.source.outputIdx, cfg.source.drawMouse, cfg.source.framerate)}`
    )
    videoInputCount = 1
    screenChain = `[0:v]hwdownload,format=bgra,format=yuv420p[screen]`
  } else if (cfg.source.kind === 'region') {
    const { offsetX, offsetY, width, height } = cfg.source
    args.push(
      '-f',
      'lavfi',
      '-i',
      `ddagrab=${ddagrabInput(cfg.source.outputIdx, cfg.source.drawMouse, cfg.source.framerate, {
        x: offsetX,
        y: offsetY,
        w: width,
        h: height
      })}`
    )
    videoInputCount = 1
    screenChain = `[0:v]hwdownload,format=bgra,format=yuv420p[screen]`
  } else {
    cfg.source.mappings.forEach((m) => {
      args.push(
        '-f',
        'lavfi',
        '-i',
        `ddagrab=${ddagrabInput(m.outputIdx, cfg.source.kind === 'virtual-desktop' ? cfg.source.drawMouse : true, cfg.source.kind === 'virtual-desktop' ? cfg.source.framerate : 30)}`
      )
    })
    videoInputCount = cfg.source.mappings.length
    const dlChain = cfg.source.mappings.map((_, i) => `[${i}:v]hwdownload,format=bgra[d${i}]`).join(';')
    const stackInputs = cfg.source.mappings.map((_, i) => `[d${i}]`).join('')
    screenChain = `${dlChain};${stackInputs}hstack=inputs=${cfg.source.mappings.length},format=yuv420p[screen]`
  }

  if (cfg.webcam) {
    args.push(
      '-f',
      'dshow',
      '-rtbufsize',
      '64M',
      '-framerate',
      String(cfg.webcam.framerate),
      '-video_size',
      '640x480',
      '-i',
      `video=${cfg.webcam.deviceName}`
    )
  }
  const webcamInputIdx = cfg.webcam ? videoInputCount : -1
  const audioBaseIdx = videoInputCount + (cfg.webcam ? 1 : 0)

  cfg.audio.forEach((a) => {
    args.push(
      '-f',
      's16le',
      '-ar',
      String(a.sampleRate),
      '-ac',
      String(a.channels),
      '-thread_queue_size',
      '4096',
      '-i',
      a.pipePath
    )
  })

  const filterParts: string[] = [screenChain]
  let finalVideoLabel = '[screen]'

  if (cfg.webcam) {
    filterParts.push(
      `[${webcamInputIdx}:v]scale=iw*${cfg.webcam.widthRatio}:-2:flags=lanczos,format=yuv420p[cam]`
    )
    filterParts.push(`[screen][cam]overlay=${pipOverlayCoords(cfg.webcam.position)}:shortest=0[vout]`)
    finalVideoLabel = '[vout]'
  }

  if (cfg.audio.length > 0) {
    const audioLabels: string[] = []
    cfg.audio.forEach((a, i) => {
      const inIdx = audioBaseIdx + i
      const lbl = `a${i}`
      const vol = Number.isFinite(a.volume) ? a.volume : 1
      filterParts.push(
        `[${inIdx}:a]aformat=channel_layouts=stereo:sample_rates=48000,volume=${vol}[${lbl}]`
      )
      audioLabels.push(`[${lbl}]`)
    })

    let premixLabel: string
    if (audioLabels.length === 1) {
      premixLabel = audioLabels[0]
    } else {
      filterParts.push(
        `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[premix]`
      )
      premixLabel = '[premix]'
    }

    const masterGain = 1.5
    filterParts.push(`${premixLabel}volume=${masterGain}[aout]`)
  }

  args.push('-filter_complex', filterParts.join(';'), '-map', finalVideoLabel)
  if (cfg.audio.length > 0) {
    args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k')
  }
  args.push(...encoderArgs(cfg.encoder, cfg.bitrate, cfg.encoderQuality))
  // Skip +faststart: the second-pass moov relocation can be cut off if
  // ffmpeg is killed before it finishes, leaving an unreadable MP4. Without
  // it the moov stays at end-of-file, which is fine for local playback.
  args.push('-pix_fmt', 'yuv420p')
  if (cfg.maxSeconds && cfg.maxSeconds > 0) {
    args.push('-t', String(cfg.maxSeconds))
  }
  args.push(cfg.outputPath)
  return args
}

/**
 * Build args for a side ffmpeg process that ONLY runs the whisper filter.
 * Decouples STT inference from the main recording pipeline so whisper
 * stalls (every queue seconds) don't back-pressure video encoding.
 */
export function buildWhisperFfmpegArgs(
  audio: AudioInput[],
  transcript: TranscriptConfig
): string[] {
  const args: string[] = ['-hide_banner', '-loglevel', 'info', '-y']

  audio.forEach((a) => {
    args.push(
      '-f',
      's16le',
      '-ar',
      String(a.sampleRate),
      '-ac',
      String(a.channels),
      '-thread_queue_size',
      '4096',
      '-i',
      a.pipePath
    )
  })

  const filterParts: string[] = []
  const labels: string[] = []
  audio.forEach((a, i) => {
    const lbl = `w${i}`
    filterParts.push(
      `[${i}:a]aformat=channel_layouts=stereo:sample_rates=48000,volume=${Number.isFinite(a.volume) ? a.volume : 1}[${lbl}]`
    )
    labels.push(`[${lbl}]`)
  })

  let premixLabel: string
  if (labels.length === 1) {
    premixLabel = labels[0]
  } else {
    filterParts.push(
      `${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0[wpremix]`
    )
    premixLabel = '[wpremix]'
  }

  const whisperFilter =
    `whisper=` +
    `model=${escapeFilterValue(transcript.modelPath)}` +
    `:destination=${escapeFilterValue(transcript.destination)}` +
    `:format=srt` +
    `:language=${transcript.language}` +
    `:queue=${transcript.queueSeconds}` +
    `:use_gpu=false`

  filterParts.push(`${premixLabel}aformat=channel_layouts=mono:sample_rates=16000,${whisperFilter}[wout]`)

  args.push('-filter_complex', filterParts.join(';'), '-map', '[wout]', '-f', 'null', '-')
  return args
}
