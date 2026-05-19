import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export interface Preferences {
  outputDir: string | null // null = use default (userData/recordings)
  maxRecordingMinutes: number // 0 = no limit
  uiLanguage: 'zh-TW' | 'en'
  autoLaunch: boolean // register as Windows login item
  autoStartRecording: boolean // when auto-launched, immediately begin recording
  startMinimized: boolean // when auto-launched, keep window hidden in tray
  // Recording config defaults
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
  // Audio
  micEnabled: boolean
  systemEnabled: boolean
  micVolume: number
  systemVolume: number
  selectedMicId: string | null
  // Webcam
  webcamEnabled: boolean
  selectedWebcamName: string | null
  webcamPosition: 'tl' | 'tr' | 'bl' | 'br'
  webcamWidthRatio: number
  webcamFramerate: number
  // STT
  sttEnabled: boolean
  selectedWhisperKey: string | null
  whisperLanguage: string
  whisperQueueSeconds: number
  schedules: ScheduleEntry[]
}

export type ScheduleType = 'once' | 'daily' | 'weekly'

export interface ScheduleEntry {
  id: string
  name: string
  enabled: boolean
  type: ScheduleType
  fireAt?: number // ms epoch (for 'once')
  hour?: number // 0..23 (for 'daily' / 'weekly')
  minute?: number // 0..59
  daysOfWeek?: number[] // 0=Sun..6=Sat (for 'weekly')
  durationMinutes: number
  lastFiredAt?: number
}

const DEFAULTS: Preferences = {
  outputDir: null,
  maxRecordingMinutes: 600, // 10 hours
  uiLanguage: 'zh-TW',
  autoLaunch: false,
  autoStartRecording: false,
  startMinimized: true,
  mode: 'display',
  selectedDisplayId: null,
  framerate: 30,
  drawMouse: true,
  encoder: null,
  encoderQuality: 'balanced',
  clickHighlightEnabled: false,
  bitrate: '12M',
  region: null,
  micEnabled: false,
  systemEnabled: false,
  micVolume: 1.5,
  systemVolume: 1.2,
  selectedMicId: null,
  webcamEnabled: false,
  selectedWebcamName: null,
  webcamPosition: 'br',
  webcamWidthRatio: 0.2,
  webcamFramerate: 30,
  sttEnabled: false,
  selectedWhisperKey: null,
  whisperLanguage: 'zh',
  whisperQueueSeconds: 5,
  schedules: []
}

class PreferenceStore {
  private filePath: string
  private cache: Preferences

  constructor() {
    this.filePath = join(app.getPath('userData'), 'preferences.json')
    this.cache = this.load()
  }

  private load(): Preferences {
    if (!existsSync(this.filePath)) return { ...DEFAULTS }
    try {
      const raw = readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<Preferences>
      return { ...DEFAULTS, ...parsed }
    } catch (e) {
      console.error('preferences load failed, using defaults', e)
      return { ...DEFAULTS }
    }
  }

  private save(): void {
    try {
      mkdirSync(app.getPath('userData'), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf8')
    } catch (e) {
      console.error('preferences save failed', e)
    }
  }

  getAll(): Preferences {
    return { ...this.cache }
  }

  get<K extends keyof Preferences>(key: K): Preferences[K] {
    return this.cache[key]
  }

  set(partial: Partial<Preferences>): Preferences {
    this.cache = { ...this.cache, ...partial }
    this.save()
    return { ...this.cache }
  }

  reset(): Preferences {
    this.cache = { ...DEFAULTS }
    this.save()
    return { ...this.cache }
  }
}

let storeSingleton: PreferenceStore | null = null

export function getPreferences(): PreferenceStore {
  if (!storeSingleton) storeSingleton = new PreferenceStore()
  return storeSingleton
}

export const DEFAULT_PREFERENCES = DEFAULTS
