import { BrowserWindow } from 'electron'
import { getPreferences, ScheduleEntry } from './preferences'

let timer: NodeJS.Timeout | null = null
let getWindowRef: (() => BrowserWindow | null) | null = null

export function computeNextFire(s: ScheduleEntry, fromMs: number): number | null {
  if (!s.enabled) return null
  if (s.type === 'once') {
    if (!s.fireAt) return null
    return s.fireAt > fromMs ? s.fireAt : null
  }
  if (s.type === 'daily') {
    if (s.hour == null || s.minute == null) return null
    for (let i = 0; i < 2; i++) {
      const d = new Date(fromMs)
      d.setDate(d.getDate() + i)
      d.setHours(s.hour, s.minute, 0, 0)
      if (d.getTime() > fromMs) return d.getTime()
    }
    return null
  }
  if (s.type === 'weekly') {
    if (s.hour == null || s.minute == null || !s.daysOfWeek?.length) return null
    for (let i = 0; i < 8; i++) {
      const d = new Date(fromMs)
      d.setDate(d.getDate() + i)
      d.setHours(s.hour, s.minute, 0, 0)
      if (d.getTime() <= fromMs) continue
      if (s.daysOfWeek.includes(d.getDay())) return d.getTime()
    }
    return null
  }
  return null
}

export interface NextFire {
  schedule: ScheduleEntry
  fireAt: number
}

export function findNextFire(now = Date.now()): NextFire | null {
  const schedules = getPreferences().get('schedules')
  let best: NextFire | null = null
  for (const s of schedules) {
    const next = computeNextFire(s, now)
    if (next == null) continue
    if (!best || next < best.fireAt) best = { schedule: s, fireAt: next }
  }
  return best
}

function fireSchedule(entry: ScheduleEntry): void {
  const win = getWindowRef?.()
  if (win && !win.isDestroyed()) {
    // Bring window forward briefly so the renderer's AudioContext.resume()
    // succeeds (some Chromium versions still require a recent user-gesture
    // context for audio playback / capture activation).
    try {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    } catch {
      // ignore
    }
    win.webContents.send('schedule:fire', {
      scheduleId: entry.id,
      name: entry.name,
      durationMinutes: entry.durationMinutes
    })
  }
  // Update bookkeeping
  const prefs = getPreferences()
  const all = prefs.getAll()
  const idx = all.schedules.findIndex((s) => s.id === entry.id)
  if (idx !== -1) {
    const updated = all.schedules.map((s, i) => {
      if (i !== idx) return s
      const next = { ...s, lastFiredAt: Date.now() }
      // Disable one-time schedule after firing
      if (s.type === 'once') next.enabled = false
      return next
    })
    prefs.set({ schedules: updated })
  }
}

export function rescheduleNext(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const next = findNextFire()
  if (!next) return
  const delay = next.fireAt - Date.now()
  if (delay <= 0) {
    // Past due — fire immediately (re-check schedule still exists & enabled)
    const live = getPreferences()
      .get('schedules')
      .find((s) => s.id === next.schedule.id)
    if (live && live.enabled) fireSchedule(live)
    rescheduleNext()
    return
  }
  // setTimeout has a max ~24.85 days; cap to 1 hour and re-arm to absorb clock drift.
  // capped=true means the timer is a "check-back" tick, not the actual fire.
  const capped = delay > 60 * 60_000
  const armMs = Math.min(delay, 60 * 60_000)
  timer = setTimeout(() => {
    timer = null
    if (!capped) {
      // Re-check schedule still exists & is enabled when the moment arrives
      const live = getPreferences()
        .get('schedules')
        .find((s) => s.id === next.schedule.id)
      if (live && live.enabled) {
        fireSchedule(live)
      }
    }
    rescheduleNext()
  }, armMs)
}

export function initScheduler(getWindow: () => BrowserWindow | null): void {
  getWindowRef = getWindow
  rescheduleNext()
}

export function stopScheduler(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
