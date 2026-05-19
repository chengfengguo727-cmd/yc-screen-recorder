import { execFile } from 'child_process'
import { getFFmpegPath } from '../paths'

export interface DshowDevice {
  name: string
  alternative?: string
}

let cachedVideo: DshowDevice[] | null = null

export function listDshowVideoDevices(force = false): Promise<DshowDevice[]> {
  if (cachedVideo && !force) return Promise.resolve(cachedVideo)
  return new Promise((resolve) => {
    execFile(
      getFFmpegPath(),
      ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
      { timeout: 5000 },
      (_err, _stdout, stderr) => {
        const output = stderr || ''
        const devices: DshowDevice[] = []
        let mode: 'unknown' | 'video' | 'audio' = 'unknown'
        let pendingForAlt: DshowDevice | null = null
        for (const rawLine of output.split(/\r?\n/)) {
          const line = rawLine.replace(/^\[[^\]]+\]\s*/, '').trim()
          if (!line) continue
          if (/DirectShow video devices/i.test(line)) {
            mode = 'video'
            continue
          }
          if (/DirectShow audio devices/i.test(line)) {
            mode = 'audio'
            continue
          }
          const taggedMatch = /^"([^"]+)"\s*\((video|audio)\)/i.exec(line)
          if (taggedMatch) {
            const isVideo = taggedMatch[2].toLowerCase() === 'video'
            if (isVideo) {
              const dev: DshowDevice = { name: taggedMatch[1] }
              devices.push(dev)
              pendingForAlt = dev
            } else {
              pendingForAlt = null
            }
            continue
          }
          const plainMatch = /^"([^"]+)"\s*$/.exec(line)
          if (plainMatch) {
            if (mode === 'video') {
              const dev: DshowDevice = { name: plainMatch[1] }
              devices.push(dev)
              pendingForAlt = dev
            } else {
              pendingForAlt = null
            }
            continue
          }
          const altMatch = /Alternative name\s+"([^"]+)"/i.exec(line)
          if (altMatch && pendingForAlt) {
            pendingForAlt.alternative = altMatch[1]
          }
        }
        cachedVideo = devices
        resolve(devices)
      }
    )
  })
}
