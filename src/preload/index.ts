import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface DisplayMapping {
  displayId: number
  outputIdx: number
  bounds: { x: number; y: number; width: number; height: number }
  isPrimary: boolean
  label: string
  scaleFactor: number
}

export interface ThumbnailInfo {
  id: string
  name: string
  display_id: string
  thumbnail: string
}

export interface EncoderCapabilities {
  preferred: string
  available: string[]
}

export interface SessionState {
  status: 'idle' | 'starting' | 'recording' | 'paused' | 'stopping' | 'finalizing' | 'error'
  outputPath?: string
  startedAt?: number
  durationMs?: number
  accumulatedMs?: number
  partCount?: number
  error?: string
}

export interface AudioTrackConfig {
  kind: 'system' | 'mic'
  channels: number
  sampleRate: number
  volume: number
}

export type PipPosition = 'tl' | 'tr' | 'bl' | 'br'

export interface WebcamArgs {
  deviceName: string
  position: PipPosition
  widthRatio: number
  framerate: number
}

export interface DshowDevice {
  name: string
  alternative?: string
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
  encoder?: string
  encoderQuality?: 'speed' | 'balanced' | 'quality'
  bitrate?: string
  audio: AudioTrackConfig[]
  webcam: WebcamArgs | null
  transcript: TranscriptArgs | null
}

export interface WhisperModelInfo {
  key: string
  filename: string
  sizeBytes: number
  description: string
  installed: boolean
}

export interface WhisperListResult {
  available: WhisperModelInfo[]
  defaultKey: string
}

export interface TranscriptSegment {
  index: number
  start: number
  end: number
  text: string
}

export interface BurnInOptions {
  inputMp4: string
  inputSrt: string
  outputMp4: string
  fontName?: string
  fontSize?: number
  outline?: number
  shadow?: number
  bitrate?: string
}

export type ScheduleType = 'once' | 'daily' | 'weekly'

export interface ScheduleEntry {
  id: string
  name: string
  enabled: boolean
  type: ScheduleType
  fireAt?: number
  hour?: number
  minute?: number
  daysOfWeek?: number[]
  durationMinutes: number
  lastFiredAt?: number
}

export interface NextFireInfo {
  scheduleId: string
  name: string
  fireAt: number
  durationMinutes: number
}

export interface ScheduleFireEvent {
  scheduleId: string
  name: string
  durationMinutes: number
}

export interface BurnProgress {
  jobId: string
  outTimeUs: number
  totalUs: number
  percent: number
  speed: string
  fps: string
}

export interface TrimOptions {
  inputMp4: string
  inputSrt: string | null
  outputMp4: string
  outputSrt: string | null
  startSec: number
  endSec: number
  reencode: boolean
}

export interface TrimProgress {
  jobId: string
  outTimeUs: number
  totalUs: number
  percent: number
}

export interface StartResult {
  outputPath: string
  transcriptPath: string | null
}

export interface RecordingFile {
  name: string
  path: string
  size: number
  mtime: number
  kind: 'video' | 'image'
  srtPath: string | null
}

export interface Preferences {
  outputDir: string | null
  maxRecordingMinutes: number
  uiLanguage: 'zh-TW' | 'en'
  autoLaunch: boolean
  autoStartRecording: boolean
  startMinimized: boolean
  mode: 'display' | 'region' | 'virtual-desktop'
  selectedDisplayId: number | null
  framerate: number
  drawMouse: boolean
  encoder: string | null
  encoderQuality: 'speed' | 'balanced' | 'quality'
  clickHighlightEnabled: boolean
  bitrate: string
  region: {
    displayId: number
    offsetX: number
    offsetY: number
    width: number
    height: number
  } | null
  micEnabled: boolean
  systemEnabled: boolean
  micVolume: number
  systemVolume: number
  selectedMicId: string | null
  webcamEnabled: boolean
  selectedWebcamName: string | null
  webcamPosition: 'tl' | 'tr' | 'bl' | 'br'
  webcamWidthRatio: number
  webcamFramerate: number
  sttEnabled: boolean
  selectedWhisperKey: string | null
  whisperLanguage: string
  whisperQueueSeconds: number
}

const api = {
  listDisplays: (): Promise<DisplayMapping[]> => ipcRenderer.invoke('recorder:displays'),
  listEncoders: (): Promise<EncoderCapabilities> => ipcRenderer.invoke('recorder:encoders'),
  listThumbnails: (): Promise<ThumbnailInfo[]> => ipcRenderer.invoke('recorder:thumbnails'),
  getState: (): Promise<SessionState> => ipcRenderer.invoke('recorder:state'),
  getLogs: (): Promise<string[]> => ipcRenderer.invoke('recorder:logs'),
  start: (args: StartArgs): Promise<StartResult> => ipcRenderer.invoke('recorder:start', args),
  stop: (): Promise<SessionState> => ipcRenderer.invoke('recorder:stop'),
  pause: (): Promise<SessionState> => ipcRenderer.invoke('recorder:pause'),
  resume: (): Promise<SessionState> => ipcRenderer.invoke('recorder:resume'),
  listRecordings: (): Promise<RecordingFile[]> => ipcRenderer.invoke('recorder:list-recordings'),
  listWebcams: (): Promise<DshowDevice[]> => ipcRenderer.invoke('recorder:list-webcams'),
  getPreferences: (): Promise<Preferences> => ipcRenderer.invoke('prefs:get'),
  setPreferences: (partial: Partial<Preferences>): Promise<Preferences> =>
    ipcRenderer.invoke('prefs:set', partial),
  resetPreferences: (): Promise<Preferences> => ipcRenderer.invoke('prefs:reset'),
  pickOutputDir: (): Promise<string | null> => ipcRenderer.invoke('prefs:pick-output-dir'),
  getCurrentOutputDir: (): Promise<string> => ipcRenderer.invoke('prefs:current-output-dir'),
  pickRegion: (): Promise<{
    displayId: number
    offsetX: number
    offsetY: number
    width: number
    height: number
  } | null> => ipcRenderer.invoke('region:pick'),
  getRegionPickerBg: (displayId: number): Promise<string | null> =>
    ipcRenderer.invoke('region:get-bg', displayId),
  submitRegionPick: (payload: {
    displayId: number
    x: number
    y: number
    w: number
    h: number
  }): void => ipcRenderer.send('region:submit', payload),
  cancelRegionPick: (): void => ipcRenderer.send('region:cancel'),
  burnInStart: (opts: BurnInOptions): Promise<{ jobId: string }> =>
    ipcRenderer.invoke('burn:start', opts),
  burnInCancel: (jobId: string): void => ipcRenderer.send('burn:cancel', jobId),
  onBurnProgress: (cb: (p: BurnProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: BurnProgress): void => cb(p)
    ipcRenderer.on('burn:progress', listener)
    return () => ipcRenderer.removeListener('burn:progress', listener)
  },
  onBurnDone: (cb: (info: { jobId: string; outputMp4: string }) => void): (() => void) => {
    const listener = (_e: unknown, info: { jobId: string; outputMp4: string }): void => cb(info)
    ipcRenderer.on('burn:done', listener)
    return () => ipcRenderer.removeListener('burn:done', listener)
  },
  onBurnError: (cb: (info: { jobId: string; error: string }) => void): (() => void) => {
    const listener = (_e: unknown, info: { jobId: string; error: string }): void => cb(info)
    ipcRenderer.on('burn:error', listener)
    return () => ipcRenderer.removeListener('burn:error', listener)
  },
  trimStart: (opts: TrimOptions): Promise<{ jobId: string }> =>
    ipcRenderer.invoke('trim:start', opts),
  trimCancel: (jobId: string): void => ipcRenderer.send('trim:cancel', jobId),
  onTrimProgress: (cb: (p: TrimProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: TrimProgress): void => cb(p)
    ipcRenderer.on('trim:progress', listener)
    return () => ipcRenderer.removeListener('trim:progress', listener)
  },
  onTrimDone: (cb: (info: { jobId: string; outputMp4: string }) => void): (() => void) => {
    const listener = (_e: unknown, info: { jobId: string; outputMp4: string }): void => cb(info)
    ipcRenderer.on('trim:done', listener)
    return () => ipcRenderer.removeListener('trim:done', listener)
  },
  onTrimError: (cb: (info: { jobId: string; error: string }) => void): (() => void) => {
    const listener = (_e: unknown, info: { jobId: string; error: string }): void => cb(info)
    ipcRenderer.on('trim:error', listener)
    return () => ipcRenderer.removeListener('trim:error', listener)
  },
  onClickOverlayClick: (
    cb: (e: { x: number; y: number; button: number }) => void
  ): (() => void) => {
    const listener = (_e: unknown, info: { x: number; y: number; button: number }): void => cb(info)
    ipcRenderer.on('click-overlay:click', listener)
    return () => ipcRenderer.removeListener('click-overlay:click', listener)
  },
  quitApp: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  minimizeToTray: (): Promise<void> => ipcRenderer.invoke('app:minimize-to-tray'),
  applyLoginItem: (): Promise<{ openAtLogin: boolean }> => ipcRenderer.invoke('app:apply-login-item'),
  onAutoStartRecord: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('app:auto-start-record', listener)
    return () => ipcRenderer.removeListener('app:auto-start-record', listener)
  },
  listSchedules: (): Promise<ScheduleEntry[]> => ipcRenderer.invoke('schedule:list'),
  saveSchedules: (schedules: ScheduleEntry[]): Promise<ScheduleEntry[]> =>
    ipcRenderer.invoke('schedule:save', schedules),
  getNextScheduleFire: (): Promise<NextFireInfo | null> => ipcRenderer.invoke('schedule:next'),
  onScheduleFire: (cb: (e: ScheduleFireEvent) => void): (() => void) => {
    const listener = (_e: unknown, info: ScheduleFireEvent): void => cb(info)
    ipcRenderer.on('schedule:fire', listener)
    return () => ipcRenderer.removeListener('schedule:fire', listener)
  },
  onAutoSplit: (cb: (info: { next: string }) => void): (() => void) => {
    const listener = (_e: unknown, info: { next: string }): void => cb(info)
    ipcRenderer.on('recorder:auto-split', listener)
    return () => ipcRenderer.removeListener('recorder:auto-split', listener)
  },
  screenshot: (displayId: number): Promise<string> =>
    ipcRenderer.invoke('recorder:screenshot', displayId),
  onHotkey: (cb: (action: string) => void): (() => void) => {
    const listener = (_e: unknown, action: string): void => cb(action)
    ipcRenderer.on('app:hotkey', listener)
    return () => ipcRenderer.removeListener('app:hotkey', listener)
  },
  virtualBounds: (): Promise<{ width: number; height: number }> =>
    ipcRenderer.invoke('recorder:virtual-bounds'),
  audioChunk: (kind: 'system' | 'mic', buffer: ArrayBuffer): void =>
    ipcRenderer.send('recorder:audio-chunk', kind, buffer),
  showInFolder: (path: string): void => ipcRenderer.send('app:show-in-folder', path),
  onState: (cb: (s: SessionState) => void): (() => void) => {
    const listener = (_e: unknown, s: SessionState): void => cb(s)
    ipcRenderer.on('recorder:state', listener)
    return () => ipcRenderer.removeListener('recorder:state', listener)
  },
  onLog: (cb: (line: string) => void): (() => void) => {
    const listener = (_e: unknown, l: string): void => cb(l)
    ipcRenderer.on('recorder:log', listener)
    return () => ipcRenderer.removeListener('recorder:log', listener)
  },
  onFinished: (
    cb: (r: { outputPath: string; durationMs: number; transcriptPath?: string | null }) => void
  ): (() => void) => {
    const listener = (
      _e: unknown,
      r: { outputPath: string; durationMs: number; transcriptPath?: string | null }
    ): void => cb(r)
    ipcRenderer.on('recorder:finished', listener)
    return () => ipcRenderer.removeListener('recorder:finished', listener)
  },
  onTranscriptSegment: (cb: (seg: TranscriptSegment) => void): (() => void) => {
    const listener = (_e: unknown, seg: TranscriptSegment): void => cb(seg)
    ipcRenderer.on('recorder:transcript', listener)
    return () => ipcRenderer.removeListener('recorder:transcript', listener)
  },
  listWhisperModels: (): Promise<WhisperListResult> => ipcRenderer.invoke('whisper:list-models'),
  downloadWhisperModel: (modelKey: string): Promise<{ path: string }> =>
    ipcRenderer.invoke('whisper:download', modelKey),
  cancelWhisperDownload: (modelKey: string): void => ipcRenderer.send('whisper:cancel', modelKey),
  onWhisperProgress: (
    cb: (p: { modelKey: string; received: number; total: number }) => void
  ): (() => void) => {
    const listener = (_e: unknown, p: { modelKey: string; received: number; total: number }): void => cb(p)
    ipcRenderer.on('whisper:progress', listener)
    return () => ipcRenderer.removeListener('whisper:progress', listener)
  },
  onWhisperDone: (cb: (p: { modelKey: string; path: string }) => void): (() => void) => {
    const listener = (_e: unknown, p: { modelKey: string; path: string }): void => cb(p)
    ipcRenderer.on('whisper:done', listener)
    return () => ipcRenderer.removeListener('whisper:done', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

export type RecorderApi = typeof api
