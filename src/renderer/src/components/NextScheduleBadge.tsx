import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NextFireInfo } from '../../../preload'

function fmtDateTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const isToday = (): boolean => {
    const n = new Date()
    return (
      n.getFullYear() === d.getFullYear() &&
      n.getMonth() === d.getMonth() &&
      n.getDate() === d.getDate()
    )
  }
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (isToday()) return time
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${time}`
}

function useHumanDelta(): (ms: number) => string {
  const { t } = useTranslation()
  return (ms: number): string => {
    if (ms < 60_000) return t('schedule.deltaLessThanMin')
    const totalMin = Math.round(ms / 60_000)
    if (totalMin < 60) return t('schedule.deltaMin', { n: totalMin })
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    if (h < 24) return m > 0 ? t('schedule.deltaHourMin', { h, m }) : t('schedule.deltaHour', { h })
    const d = Math.floor(h / 24)
    const hh = h % 24
    return hh > 0 ? t('schedule.deltaDayHour', { d, h: hh }) : t('schedule.deltaDay', { d })
  }
}

export function NextScheduleBadge(): React.JSX.Element | null {
  const { t } = useTranslation()
  const humanDelta = useHumanDelta()
  const [next, setNext] = useState<NextFireInfo | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    let cancelled = false
    const refresh = async (): Promise<void> => {
      try {
        const n = await window.api.getNextScheduleFire()
        if (!cancelled) setNext(n)
      } catch {
        // ignore
      }
    }
    void refresh()
    const refreshId = setInterval(() => void refresh(), 30_000)
    const tickId = setInterval(() => setNow(Date.now()), 5_000)
    return () => {
      cancelled = true
      clearInterval(refreshId)
      clearInterval(tickId)
    }
  }, [])

  if (!next) return null

  const delta = next.fireAt - now
  const urgent = delta < 60_000

  return (
    <div
      className={`schedule-badge ${urgent ? 'urgent' : ''}`}
      title={t('badge.tooltip', { name: next.name, minutes: next.durationMinutes })}
    >
      <span className="schedule-badge-icon">⏰</span>
      <span className="schedule-badge-time">{fmtDateTime(next.fireAt)}</span>
      <span className="schedule-badge-delta">（{humanDelta(delta)}）</span>
    </div>
  )
}
