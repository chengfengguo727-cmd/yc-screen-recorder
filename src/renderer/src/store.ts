import { create } from 'zustand'
import type {
  DisplayMapping,
  DshowDevice,
  EncoderCapabilities,
  PipPosition,
  Preferences,
  RecordingFile,
  SessionState,
  ThumbnailInfo,
  TranscriptSegment,
  WhisperModelInfo
} from '../../preload'

type Mode = 'display' | 'region' | 'virtual-desktop'

export interface AudioDevice {
  deviceId: string
  label: string
}

export interface SelectedRegion {
  displayId: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

// Keys in AppState that mirror Preferences and should be persisted on change.
export const PERSISTED_KEYS = [
  'mode',
  'selectedDisplayId',
  'framerate',
  'drawMouse',
  'encoder',
  'bitrate',
  'encoderQuality',
  'clickHighlightEnabled',
  'region',
  'micEnabled',
  'systemEnabled',
  'micVolume',
  'systemVolume',
  'selectedMicId',
  'webcamEnabled',
  'selectedWebcamName',
  'webcamPosition',
  'webcamWidthRatio',
  'webcamFramerate',
  'sttEnabled',
  'selectedWhisperKey',
  'whisperLanguage',
  'whisperQueueSeconds'
] as const

interface AppState {
  displays: DisplayMapping[]
  thumbnails: ThumbnailInfo[]
  encoders: EncoderCapabilities | null
  recordings: RecordingFile[]
  session: SessionState
  logs: string[]
  preferences: Preferences | null
  mode: Mode
  selectedDisplayId: number | null
  framerate: number
  drawMouse: boolean
  encoder: string | null
  encoderQuality: 'speed' | 'balanced' | 'quality'
  clickHighlightEnabled: boolean
  bitrate: string
  region: SelectedRegion | null
  micDevices: AudioDevice[]
  selectedMicId: string | null
  micEnabled: boolean
  systemEnabled: boolean
  micVolume: number
  systemVolume: number
  webcamDevices: DshowDevice[]
  selectedWebcamName: string | null
  webcamEnabled: boolean
  webcamPosition: PipPosition
  webcamWidthRatio: number
  webcamFramerate: number
  whisperModels: WhisperModelInfo[]
  selectedWhisperKey: string | null
  whisperLanguage: string
  whisperQueueSeconds: number
  sttEnabled: boolean
  modelDownload: { modelKey: string; received: number; total: number } | null
  transcriptSegments: TranscriptSegment[]
  refresh: () => Promise<void>
  refreshRecordings: () => Promise<void>
  refreshMicDevices: () => Promise<void>
  refreshWebcams: () => Promise<void>
  refreshThumbnails: () => Promise<void>
  reloadPreferences: () => Promise<void>
  setMode: (m: Mode) => void
  setSelectedDisplayId: (id: number) => void
  setFramerate: (n: number) => void
  setDrawMouse: (v: boolean) => void
  setEncoder: (e: string) => void
  setBitrate: (b: string) => void
  setEncoderQuality: (q: 'speed' | 'balanced' | 'quality') => void
  setClickHighlightEnabled: (v: boolean) => void
  setRegion: (r: SelectedRegion | null) => void
  setSession: (s: SessionState) => void
  appendLog: (l: string) => void
  setMicEnabled: (v: boolean) => void
  setSystemEnabled: (v: boolean) => void
  setMicVolume: (v: number) => void
  setSystemVolume: (v: number) => void
  setSelectedMicId: (id: string | null) => void
  setWebcamEnabled: (v: boolean) => void
  setSelectedWebcamName: (n: string | null) => void
  setWebcamPosition: (p: PipPosition) => void
  setWebcamWidthRatio: (r: number) => void
  setWebcamFramerate: (f: number) => void
  refreshWhisperModels: () => Promise<void>
  setSelectedWhisperKey: (k: string | null) => void
  setWhisperLanguage: (l: string) => void
  setWhisperQueueSeconds: (s: number) => void
  setSttEnabled: (v: boolean) => void
  setModelDownload: (p: { modelKey: string; received: number; total: number } | null) => void
  appendTranscript: (s: TranscriptSegment) => void
  clearTranscript: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  displays: [],
  thumbnails: [],
  encoders: null,
  recordings: [],
  session: { status: 'idle' },
  logs: [],
  preferences: null,
  mode: 'display',
  selectedDisplayId: null,
  framerate: 30,
  drawMouse: true,
  encoder: null,
  encoderQuality: 'balanced',
  clickHighlightEnabled: false,
  bitrate: '12M',
  region: null,
  micDevices: [],
  selectedMicId: null,
  micEnabled: false,
  systemEnabled: false,
  micVolume: 1.5,
  systemVolume: 1.2,
  webcamDevices: [],
  selectedWebcamName: null,
  webcamEnabled: false,
  webcamPosition: 'br',
  webcamWidthRatio: 0.2,
  webcamFramerate: 30,
  whisperModels: [],
  selectedWhisperKey: null,
  whisperLanguage: 'zh',
  whisperQueueSeconds: 5,
  sttEnabled: false,
  modelDownload: null,
  transcriptSegments: [],
  reloadPreferences: async (): Promise<void> => {
    const prefs = await window.api.getPreferences()
    set({
      preferences: prefs,
      mode: prefs.mode,
      selectedDisplayId: prefs.selectedDisplayId,
      framerate: prefs.framerate,
      drawMouse: prefs.drawMouse,
      encoder: prefs.encoder,
      encoderQuality: prefs.encoderQuality,
      clickHighlightEnabled: prefs.clickHighlightEnabled,
      bitrate: prefs.bitrate,
      region: prefs.region,
      micEnabled: prefs.micEnabled,
      systemEnabled: prefs.systemEnabled,
      micVolume: prefs.micVolume,
      systemVolume: prefs.systemVolume,
      selectedMicId: prefs.selectedMicId,
      webcamEnabled: prefs.webcamEnabled,
      selectedWebcamName: prefs.selectedWebcamName,
      webcamPosition: prefs.webcamPosition,
      webcamWidthRatio: prefs.webcamWidthRatio,
      webcamFramerate: prefs.webcamFramerate,
      sttEnabled: prefs.sttEnabled,
      selectedWhisperKey: prefs.selectedWhisperKey,
      whisperLanguage: prefs.whisperLanguage,
      whisperQueueSeconds: prefs.whisperQueueSeconds
    })
  },
  refresh: async (): Promise<void> => {
    const [displays, thumbnails, encoders, state, recordings] = await Promise.all([
      window.api.listDisplays(),
      window.api.listThumbnails(),
      window.api.listEncoders(),
      window.api.getState(),
      window.api.listRecordings()
    ])
    set((prev) => ({
      displays,
      thumbnails,
      encoders,
      session: state,
      recordings,
      selectedDisplayId:
        prev.selectedDisplayId ?? displays.find((d) => d.isPrimary)?.displayId ?? displays[0]?.displayId ?? null,
      encoder: prev.encoder ?? encoders.preferred
    }))
  },
  refreshRecordings: async (): Promise<void> => {
    const recordings = await window.api.listRecordings()
    set({ recordings })
  },
  refreshThumbnails: async (): Promise<void> => {
    try {
      const thumbnails = await window.api.listThumbnails()
      set({ thumbnails })
    } catch {
      // ignore transient failure
    }
  },
  refreshMicDevices: async (): Promise<void> => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) =>
        s.getTracks().forEach((t) => t.stop())
      )
    } catch {
      // permission denied — still enumerate (labels will be empty)
    }
    const all = await navigator.mediaDevices.enumerateDevices()
    const mics = all
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 6)}` }))
    set((prev) => ({
      micDevices: mics,
      selectedMicId:
        prev.selectedMicId ??
        mics.find((m) => m.deviceId === 'default')?.deviceId ??
        mics[0]?.deviceId ??
        null
    }))
  },
  setMode: (mode): void => set({ mode }),
  setSelectedDisplayId: (id): void => set({ selectedDisplayId: id }),
  setFramerate: (n): void => set({ framerate: n }),
  setDrawMouse: (v): void => set({ drawMouse: v }),
  setEncoder: (e): void => set({ encoder: e }),
  setBitrate: (b): void => set({ bitrate: b }),
  setEncoderQuality: (q): void => set({ encoderQuality: q }),
  setClickHighlightEnabled: (v): void => set({ clickHighlightEnabled: v }),
  setRegion: (r): void => set({ region: r }),
  setSession: (s): void => set({ session: s }),
  appendLog: (l): void => {
    const logs = get().logs.concat(l)
    if (logs.length > 300) logs.splice(0, logs.length - 300)
    set({ logs })
  },
  setMicEnabled: (v): void => set({ micEnabled: v }),
  setSystemEnabled: (v): void => set({ systemEnabled: v }),
  setMicVolume: (v): void => set({ micVolume: v }),
  setSystemVolume: (v): void => set({ systemVolume: v }),
  setSelectedMicId: (id): void => set({ selectedMicId: id }),
  refreshWebcams: async (): Promise<void> => {
    const devices = await window.api.listWebcams()
    set((prev) => ({
      webcamDevices: devices,
      selectedWebcamName: prev.selectedWebcamName ?? devices[0]?.name ?? null
    }))
  },
  setWebcamEnabled: (v): void => set({ webcamEnabled: v }),
  setSelectedWebcamName: (n): void => set({ selectedWebcamName: n }),
  setWebcamPosition: (p): void => set({ webcamPosition: p }),
  setWebcamWidthRatio: (r): void => set({ webcamWidthRatio: r }),
  setWebcamFramerate: (f): void => set({ webcamFramerate: f }),
  refreshWhisperModels: async (): Promise<void> => {
    const res = await window.api.listWhisperModels()
    set((prev) => ({
      whisperModels: res.available,
      selectedWhisperKey:
        prev.selectedWhisperKey ??
        res.available.find((m) => m.installed)?.key ??
        res.defaultKey
    }))
  },
  setSelectedWhisperKey: (k): void => set({ selectedWhisperKey: k }),
  setWhisperLanguage: (l): void => set({ whisperLanguage: l }),
  setWhisperQueueSeconds: (s): void => set({ whisperQueueSeconds: s }),
  setSttEnabled: (v): void => set({ sttEnabled: v }),
  setModelDownload: (p): void => set({ modelDownload: p }),
  appendTranscript: (s): void => {
    const segs = get().transcriptSegments.concat(s)
    if (segs.length > 2000) segs.splice(0, segs.length - 2000)
    set({ transcriptSegments: segs })
  },
  clearTranscript: (): void => set({ transcriptSegments: [] })
}))

// Auto-persist preference-mirroring keys on every change
let persistDebounce: number | null = null
useAppStore.subscribe((state, prev) => {
  const changes: Partial<Preferences> = {}
  let hasChanges = false
  for (const key of PERSISTED_KEYS) {
    const a = state[key] as unknown
    const b = prev[key] as unknown
    if (a !== b) {
      ;(changes as Record<string, unknown>)[key] = a
      hasChanges = true
    }
  }
  if (!hasChanges) return
  if (persistDebounce != null) clearTimeout(persistDebounce)
  persistDebounce = window.setTimeout(() => {
    void window.api.setPreferences(changes)
  }, 200)
})
