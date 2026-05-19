import { BrowserWindow, ipcMain, desktopCapturer, dialog, shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { readdir, stat, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const execFileAsync = promisify(execFile)
import { probeEncoders, VideoEncoder } from './recorder/encoder-probe'
import { buildDisplayMap, virtualDesktopBounds, DisplayMapping } from './recorder/display-map'
import { session } from './recorder/session'
import { SourceMode, PipPosition, TranscriptConfig } from './recorder/ffmpeg-args'
import { listDshowVideoDevices } from './recorder/dshow-devices'
import { getFFmpegPath, getRecordingsDir } from './paths'
import {
  MODELS,
  DEFAULT_MODEL_KEY,
  getInstalledModels,
  getModelPath,
  WhisperDownloader
} from './stt/models'
import { getPreferences, Preferences, ScheduleEntry } from './preferences'
import { BurnInJob } from './burn-in'
import { TrimJob } from './trim'
import { rescheduleNext, findNextFire } from './scheduler'
import { randomBytes } from 'crypto'

export interface AudioTrackConfig {
  kind: 'system' | 'mic'
  channels: number
  sampleRate: number
  volume: number
}

export interface WebcamArgs {
  deviceName: string
  position: PipPosition
  widthRatio: number
  framerate: number
}

export interface TranscriptArgs {
  modelKey: string
  language: string
  queueSeconds: number
}

export interface StartArgs {
  mode: 'display' | 'region' | 'virtual-desktop'
  displayId?: number
  region?: { offsetX: number; offsetY: number; width: number; height: number; displayId: number }
  drawMouse: boolean
  framerate: number
  encoder?: VideoEncoder
  encoderQuality?: 'speed' | 'balanced' | 'quality'
  bitrate?: string
  audio: AudioTrackConfig[]
  webcam: WebcamArgs | null
  transcript: TranscriptArgs | null
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function buildAndStartSession(args: StartArgs, outputPath: string): Promise<void> {
  const maps = await buildDisplayMap()
  const encs = await probeEncoders()
  const encoder = args.encoder ?? encs.preferred

  let source: SourceMode
  if (args.mode === 'display') {
    const m = maps.find((x) => x.displayId === args.displayId) ?? maps[0]
    source = {
      kind: 'display',
      outputIdx: m.outputIdx,
      drawMouse: args.drawMouse,
      framerate: args.framerate
    }
  } else if (args.mode === 'region' && args.region) {
    const m = maps.find((x) => x.displayId === args.region!.displayId) ?? maps[0]
    source = {
      kind: 'region',
      outputIdx: m.outputIdx,
      offsetX: args.region.offsetX,
      offsetY: args.region.offsetY,
      width: args.region.width,
      height: args.region.height,
      drawMouse: args.drawMouse,
      framerate: args.framerate
    }
  } else {
    source = {
      kind: 'virtual-desktop',
      mappings: maps,
      drawMouse: args.drawMouse,
      framerate: args.framerate
    }
  }

  let transcript: TranscriptConfig | null = null
  if (args.transcript) {
    const modelPath = getModelPath(args.transcript.modelKey)
    if (!existsSync(modelPath)) {
      throw new Error(`Whisper 模型未下載：${args.transcript.modelKey}`)
    }
    const srtPath = outputPath.replace(/\.mp4$/i, '.srt')
    transcript = {
      modelPath,
      destination: srtPath,
      language: args.transcript.language,
      queueSeconds: args.transcript.queueSeconds
    }
  }

  const maxMinutes = getPreferences().get('maxRecordingMinutes')
  const maxSeconds = maxMinutes > 0 ? maxMinutes * 60 : null

  await session.start({
    source,
    encoder: (args.encoder ?? encoder) as VideoEncoder,
    encoderQuality: args.encoderQuality ?? getPreferences().get('encoderQuality'),
    bitrate: args.bitrate ?? '12M',
    outputPath,
    audio: args.audio,
    webcam: args.webcam,
    transcript,
    maxSeconds
  })
}

// Tracks last successful start args so auto-split can restart with same config
let lastStartArgs: StartArgs | null = null

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  session.on('state', (s) => getWindow()?.webContents.send('recorder:state', s))
  session.on('log', (l) => getWindow()?.webContents.send('recorder:log', l))
  session.on('finished', async (r) => {
    getWindow()?.webContents.send('recorder:finished', r)
    if (r?.autoSplit && lastStartArgs) {
      try {
        const nextOutput = join(getRecordingsDir(), `rec-${timestamp()}.mp4`)
        await buildAndStartSession(lastStartArgs, nextOutput)
        getWindow()?.webContents.send('recorder:auto-split', { next: nextOutput })
      } catch (e) {
        getWindow()?.webContents.send('recorder:log', `[auto-split] failed: ${(e as Error).message}`)
        lastStartArgs = null
      }
    } else {
      lastStartArgs = null
    }
  })
  session.on('transcript', (seg) => getWindow()?.webContents.send('recorder:transcript', seg))

  ipcMain.handle('recorder:displays', async () => buildDisplayMap())

  ipcMain.handle('recorder:encoders', async () => probeEncoders())

  ipcMain.handle('recorder:thumbnails', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 }
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      display_id: s.display_id,
      thumbnail: s.thumbnail.toDataURL()
    }))
  })

  ipcMain.handle('recorder:state', () => session.getState())
  ipcMain.handle('recorder:logs', () => session.getLogs())

  ipcMain.handle('recorder:start', async (_evt, args: StartArgs) => {
    const outputPath = join(getRecordingsDir(), `rec-${timestamp()}.mp4`)
    lastStartArgs = args
    await buildAndStartSession(args, outputPath)
    const transcriptPath = args.transcript ? outputPath.replace(/\.mp4$/i, '.srt') : null
    return { outputPath, transcriptPath }
  })

  ipcMain.handle('recorder:stop', async () => {
    lastStartArgs = null
    await session.stop()
    return session.getState()
  })

  ipcMain.handle('recorder:pause', async () => {
    await session.pause()
    return session.getState()
  })

  ipcMain.handle('recorder:resume', async () => {
    await session.resume()
    return session.getState()
  })

  ipcMain.handle('recorder:list-webcams', async () => listDshowVideoDevices())

  ipcMain.handle('whisper:list-models', async () => {
    const installed = await getInstalledModels()
    const installedKeys = new Set(installed.map((m) => m.key))
    return {
      available: Object.values(MODELS).map((m) => ({
        key: m.key,
        filename: m.filename,
        sizeBytes: m.sizeBytes,
        description: m.description,
        installed: installedKeys.has(m.key)
      })),
      defaultKey: DEFAULT_MODEL_KEY
    }
  })

  const downloaders = new Map<string, WhisperDownloader>()

  ipcMain.handle('whisper:download', async (_evt, modelKey: string) => {
    if (downloaders.has(modelKey)) throw new Error('已在下載中')
    const dl = new WhisperDownloader()
    downloaders.set(modelKey, dl)
    dl.on('progress', (p) => getWindow()?.webContents.send('whisper:progress', { modelKey, ...p }))
    try {
      const path = await dl.download(modelKey)
      getWindow()?.webContents.send('whisper:done', { modelKey, path })
      return { path }
    } finally {
      downloaders.delete(modelKey)
    }
  })

  ipcMain.on('whisper:cancel', (_evt, modelKey: string) => {
    downloaders.get(modelKey)?.abort()
  })

  ipcMain.on('recorder:audio-chunk', (_evt, kind: 'system' | 'mic', data: ArrayBuffer) => {
    session.writeAudio(kind, Buffer.from(data))
  })

  ipcMain.handle('recorder:list-recordings', async () => {
    const dir = getRecordingsDir()
    try {
      const entries = await readdir(dir)
      const fileSet = new Set(entries)
      const files = await Promise.all(
        entries
          .filter((f) => f.endsWith('.mp4') || f.endsWith('.png'))
          .map(async (f) => {
            const full = join(dir, f)
            const s = await stat(full)
            const srtName = f.replace(/\.mp4$/i, '.srt')
            const srtPath = f.endsWith('.mp4') && fileSet.has(srtName) ? join(dir, srtName) : null
            return {
              name: f,
              path: full,
              size: s.size,
              mtime: s.mtimeMs,
              kind: f.endsWith('.png') ? ('image' as const) : ('video' as const),
              srtPath
            }
          })
      )
      return files.sort((a, b) => b.mtime - a.mtime)
    } catch {
      return []
    }
  })

  ipcMain.handle('recorder:screenshot', async (_evt, displayId: number) => {
    const maps = await buildDisplayMap()
    const m = maps.find((x) => x.displayId === displayId) ?? maps[0]
    const dir = getRecordingsDir()
    await mkdir(dir, { recursive: true })
    const path = join(dir, `shot-${timestamp()}.png`)
    await execFileAsync(
      getFFmpegPath(),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `ddagrab=output_idx=${m.outputIdx}:framerate=1`,
        '-frames:v',
        '1',
        '-vf',
        'hwdownload,format=bgra',
        '-y',
        path
      ],
      { timeout: 8000 }
    )
    return path
  })

  ipcMain.handle('recorder:virtual-bounds', async () => {
    const maps = await buildDisplayMap()
    return virtualDesktopBounds(maps as DisplayMapping[])
  })

  ipcMain.on('app:show-in-folder', (_evt, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('prefs:get', () => getPreferences().getAll())
  ipcMain.handle('prefs:set', (_evt, partial: Partial<Preferences>) =>
    getPreferences().set(partial)
  )
  ipcMain.handle('prefs:reset', () => getPreferences().reset())

  ipcMain.handle('prefs:pick-output-dir', async () => {
    const current = getPreferences().get('outputDir') ?? getRecordingsDir()
    const result = await dialog.showOpenDialog({
      title: '選擇錄影輸出資料夾',
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('prefs:current-output-dir', () => getRecordingsDir())

  const burnJobs = new Map<string, BurnInJob>()

  ipcMain.handle(
    'burn:start',
    async (
      _evt,
      args: {
        inputMp4: string
        inputSrt: string
        outputMp4: string
        fontName?: string
        fontSize?: number
        outline?: number
        shadow?: number
        bitrate?: string
      }
    ) => {
      const jobId = randomBytes(4).toString('hex')
      const job = new BurnInJob(jobId)
      burnJobs.set(jobId, job)

      job.on('progress', (p) => getWindow()?.webContents.send('burn:progress', p))
      job.on('log', (l) => getWindow()?.webContents.send('burn:log', { jobId, line: l }))

      void job
        .run({
          inputMp4: args.inputMp4,
          inputSrt: args.inputSrt,
          outputMp4: args.outputMp4,
          fontName: args.fontName ?? 'Microsoft JhengHei',
          fontSize: args.fontSize ?? 24,
          outline: args.outline ?? 2,
          shadow: args.shadow ?? 0,
          bitrate: args.bitrate ?? '12M'
        })
        .then(() => {
          getWindow()?.webContents.send('burn:done', { jobId, outputMp4: args.outputMp4 })
        })
        .catch((e) => {
          getWindow()?.webContents.send('burn:error', { jobId, error: (e as Error).message })
        })
        .finally(() => burnJobs.delete(jobId))

      return { jobId }
    }
  )

  ipcMain.on('burn:cancel', (_evt, jobId: string) => {
    burnJobs.get(jobId)?.cancel()
  })

  ipcMain.handle('schedule:list', () => getPreferences().get('schedules'))

  ipcMain.handle('schedule:save', (_evt, schedules: ScheduleEntry[]) => {
    getPreferences().set({ schedules })
    rescheduleNext()
    return schedules
  })

  const trimJobs = new Map<string, TrimJob>()

  ipcMain.handle(
    'trim:start',
    async (
      _evt,
      args: {
        inputMp4: string
        inputSrt: string | null
        outputMp4: string
        outputSrt: string | null
        startSec: number
        endSec: number
        reencode: boolean
      }
    ) => {
      const jobId = randomBytes(4).toString('hex')
      const job = new TrimJob(jobId)
      trimJobs.set(jobId, job)
      job.on('progress', (p) => getWindow()?.webContents.send('trim:progress', p))
      job.on('log', (l) => getWindow()?.webContents.send('trim:log', { jobId, line: l }))

      void job
        .run(args)
        .then(() => {
          getWindow()?.webContents.send('trim:done', { jobId, outputMp4: args.outputMp4 })
        })
        .catch((e) => {
          getWindow()?.webContents.send('trim:error', { jobId, error: (e as Error).message })
        })
        .finally(() => trimJobs.delete(jobId))

      return { jobId }
    }
  )

  ipcMain.on('trim:cancel', (_evt, jobId: string) => {
    trimJobs.get(jobId)?.cancel()
  })

  ipcMain.handle('schedule:next', () => {
    const next = findNextFire()
    if (!next) return null
    return {
      scheduleId: next.schedule.id,
      name: next.schedule.name,
      fireAt: next.fireAt,
      durationMinutes: next.schedule.durationMinutes
    }
  })
}
