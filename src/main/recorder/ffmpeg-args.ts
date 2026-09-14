import { encoderArgs, VideoEncoder, EncoderQuality, isD3d11DirectAvailable } from './encoder-probe'
import { DisplayMapping } from './display-map'

export type SourceMode =
  | {
      kind: 'display'
      outputIdx: number
      refreshHz?: number
      drawMouse: boolean
      framerate: number
    }
  | {
      kind: 'region'
      outputIdx: number
      refreshHz?: number
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
  const captureFps = cfg.source.framerate

  // Keep ddagrab's frames on the GPU and hand the D3D11 surfaces straight to
  // NVENC. The old path downloaded every frame to system memory (8.3 MB/frame
  // at 1080p = ~250 MB/s) and converted colour on the CPU, which left the
  // pipeline with zero headroom — measured 2.4s CPU per 20s recorded vs 0.6s
  // for this path. With no headroom, any competing GPU/CPU load made ffmpeg
  // fall behind and the capture froze for progressively longer stretches.
  // Only usable for a single source with no CPU-side compositing.
  const gpuDirect =
    cfg.encoder === 'h264_nvenc' &&
    isD3d11DirectAvailable() &&
    !cfg.webcam &&
    (cfg.source.kind === 'display' ||
      cfg.source.kind === 'region' ||
      (cfg.source.kind === 'virtual-desktop' && cfg.source.mappings.length === 1))
  // ddagrab paces its own capture loop off an internal timer rather than the
  // panel's vblank. Asking it for a rate below the refresh rate makes it grab
  // at 1/2/3/4-refresh intervals in an irregular pattern (measured on a 60Hz
  // panel at framerate=30: only 42% of frames landed on the correct 2-refresh
  // boundary). It then stamps every frame on a perfectly even grid, so the
  // timestamps hide the error and no downstream filter can undo it — the
  // result is unique, non-dropped frames showing moments that are up to a
  // whole frame period out of place, i.e. visible judder.
  //
  // Asking for the panel's exact refresh rate lets the duplication API itself
  // do the pacing, which roughly halves the temporal error (RMS 9.7ms -> 5.8ms
  // measured against an on-screen reference of known timing). When the user
  // wants a lower output rate we decimate afterwards with `fps`, which still
  // beats grabbing at the low rate directly (9.7ms -> 7.9ms).
  //
  // Only do this on the GPU-direct path: grabbing at double rate on the
  // hwdownload path would double an already CPU-bound copy and bring back the
  // capture starvation that used to freeze long recordings.
  const MAX_GRAB_FPS = 120
  const sourceRefreshHz =
    cfg.source.kind === 'virtual-desktop'
      ? Math.min(...cfg.source.mappings.map((m) => m.refreshHz || 60))
      : cfg.source.refreshHz || 60
  const grabFps =
    gpuDirect && sourceRefreshHz > captureFps ? Math.min(sourceRefreshHz, MAX_GRAB_FPS) : captureFps
  const decimate = grabFps !== captureFps
  const singleSourceChain = gpuDirect
    ? `[0:v]${decimate ? `fps=${captureFps}` : 'null'}[screen]`
    : `[0:v]hwdownload,format=bgra,format=yuv420p[screen]`

  if (cfg.source.kind === 'display') {
    args.push(
      '-f',
      'lavfi',
      '-i',
      `ddagrab=${ddagrabInput(cfg.source.outputIdx, cfg.source.drawMouse, grabFps)}`
    )
    videoInputCount = 1
    screenChain = singleSourceChain
  } else if (cfg.source.kind === 'region') {
    const { offsetX, offsetY, width, height } = cfg.source
    args.push(
      '-f',
      'lavfi',
      '-i',
      `ddagrab=${ddagrabInput(cfg.source.outputIdx, cfg.source.drawMouse, grabFps, {
        x: offsetX,
        y: offsetY,
        w: width,
        h: height
      })}`
    )
    videoInputCount = 1
    screenChain = singleSourceChain
  } else {
    // virtual-desktop: one ddagrab per display, composite with xstack using
    // each display's actual virtual-desktop pixel position. hstack would only
    // work for equal-height rows; the user can have mixed resolutions and/or
    // displays above the primary (negative Y).
    const mappings = cfg.source.mappings
    const drawMouse = cfg.source.drawMouse
    const framerate = grabFps
    mappings.forEach((m) => {
      args.push(
        '-f',
        'lavfi',
        '-i',
        `ddagrab=${ddagrabInput(m.outputIdx, drawMouse, framerate)}`
      )
    })
    videoInputCount = mappings.length

    if (mappings.length === 1) {
      screenChain = singleSourceChain
    } else {
      const minX = Math.min(...mappings.map((m) => m.bounds.x))
      const minY = Math.min(...mappings.map((m) => m.bounds.y))
      const dlChain = mappings.map((_, i) => `[${i}:v]hwdownload,format=bgra[d${i}]`).join(';')
      const stackInputs = mappings.map((_, i) => `[d${i}]`).join('')
      let canvasW = 0
      let canvasH = 0
      const layout = mappings
        .map((m) => {
          // bounds are in DIPs; multiply by display's scaleFactor to get
          // physical pixels (matches ddagrab's native resolution).
          const x = Math.max(0, Math.round((m.bounds.x - minX) * m.scaleFactor))
          const y = Math.max(0, Math.round((m.bounds.y - minY) * m.scaleFactor))
          const w = Math.round(m.bounds.width * m.scaleFactor)
          const h = Math.round(m.bounds.height * m.scaleFactor)
          canvasW = Math.max(canvasW, x + w)
          canvasH = Math.max(canvasH, y + h)
          return `${x}_${y}`
        })
        .join('|')

      // H.264 (incl. NVENC) max dimension is 4096. If the composited virtual-
      // desktop canvas exceeds that, downscale proportionally to fit.
      const MAX_DIM = 3840
      const ratio = Math.min(MAX_DIM / canvasW, MAX_DIM / canvasH, 1)
      const evenize = (n: number): number => Math.max(2, Math.floor(n / 2) * 2)
      const targetW = evenize(canvasW * ratio)
      const targetH = evenize(canvasH * ratio)
      const scaleFilter = ratio < 1 ? `,scale=${targetW}:${targetH}:flags=lanczos` : ''

      screenChain = `${dlChain};${stackInputs}xstack=inputs=${mappings.length}:layout=${layout}:fill=black${scaleFilter},format=yuv420p[screen]`
    }
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

  const videoFilterParts: string[] = [screenChain]
  const audioFilterParts: string[] = []
  let finalVideoLabel = '[screen]'

  if (cfg.webcam) {
    videoFilterParts.push(
      `[${webcamInputIdx}:v]scale=iw*${cfg.webcam.widthRatio}:-2:flags=lanczos,format=yuv420p[cam]`
    )
    videoFilterParts.push(
      `[screen][cam]overlay=${pipOverlayCoords(cfg.webcam.position)}:shortest=0[vout]`
    )
    finalVideoLabel = '[vout]'
  }

  if (cfg.audio.length > 0) {
    const audioLabels: string[] = []
    cfg.audio.forEach((a, i) => {
      const inIdx = audioBaseIdx + i
      const lbl = `a${i}`
      const vol = Number.isFinite(a.volume) ? a.volume : 1
      audioFilterParts.push(
        `[${inIdx}:a]aformat=channel_layouts=stereo:sample_rates=48000,volume=${vol}[${lbl}]`
      )
      audioLabels.push(`[${lbl}]`)
    })

    let premixLabel: string
    if (audioLabels.length === 1) {
      premixLabel = audioLabels[0]
    } else {
      audioFilterParts.push(
        `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[premix]`
      )
      premixLabel = '[premix]'
    }

    const masterGain = 1.5
    audioFilterParts.push(`${premixLabel}volume=${masterGain}[aout]`)
  }

  // Video and audio must live in separate filtergraphs. In one shared graph,
  // ffmpeg's scheduler only lets through the input that graph is currently
  // waiting on, so whenever audio from the pipe arrived a little late the
  // screen capture was held back with it — the picture stuttered while the
  // sound stayed perfect. Measured at 60fps over 30s (duplicated frames out of
  // 1800): a 400ms audio hiccup every 3s went 189 -> 48, 2% audio loss 741 -> 22.
  args.push('-filter_complex', videoFilterParts.join(';'))
  if (audioFilterParts.length > 0) args.push('-filter_complex', audioFilterParts.join(';'))
  args.push('-map', finalVideoLabel)
  if (cfg.audio.length > 0) {
    args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k')
  }
  args.push(...encoderArgs(cfg.encoder, cfg.bitrate, cfg.encoderQuality))
  // Skip +faststart: the second-pass moov relocation can be cut off if
  // ffmpeg is killed before it finishes, leaving an unreadable MP4. Without
  // it the moov stays at end-of-file, which is fine for local playback.
  // Force constant frame rate. ddagrab intermittently misses its deadline, and
  // without this those gaps land in the MP4 as uneven PTS (variable frame
  // rate) — players show that as judder that looks worse the longer the
  // recording runs, even though audio stays perfectly smooth. CFR duplicates
  // the previous frame instead, keeping the timeline evenly spaced.
  args.push('-fps_mode', 'cfr', '-r', String(captureFps))
  if (!gpuDirect) args.push('-pix_fmt', 'yuv420p')
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
