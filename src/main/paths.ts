import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getPreferences } from './preferences'

export function getFFmpegPath(): string {
  const resourcesRoot = is.dev
    ? join(app.getAppPath(), 'resources')
    : process.resourcesPath
  const bundled = join(resourcesRoot, 'ffmpeg', 'ffmpeg.exe')
  if (existsSync(bundled)) return bundled
  return 'ffmpeg'
}

export function getFFprobePath(): string {
  const resourcesRoot = is.dev
    ? join(app.getAppPath(), 'resources')
    : process.resourcesPath
  const bundled = join(resourcesRoot, 'ffmpeg', 'ffprobe.exe')
  if (existsSync(bundled)) return bundled
  return 'ffprobe'
}

export function getRecordingsDir(): string {
  const custom = getPreferences().get('outputDir')
  if (custom && custom.trim().length > 0) return custom
  return join(app.getPath('userData'), 'recordings')
}
