import { useEffect, useState } from 'react'
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

function humanDelta(ms: number): string {
  if (ms < 60_000) return '< 1 分鐘'
  const totalMin = Math.round(ms / 60_000)
  if (totalMin < 60) return `${totalMin} 分後`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h < 24) return m > 0 ? `${h} 小時 ${m} 分後` : `${h} 小時後`
  const d = Math.floor(h / 24)
  return `${d} 天後`
}

export function NextScheduleBadge(): React.JSX.Element | null {
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
    <div className={`schedule-badge ${urgent ? 'urgent' : ''}`} title={`${next.name} · 錄 ${next.durationMinutes} 分鐘`}>
      <span className="schedule-badge-icon">⏰</span>
      <span className="schedule-badge-time">{fmtDateTime(next.fireAt)}</span>
      <span className="schedule-badge-delta">（{humanDelta(delta)}）</span>
    </div>
  )
}
