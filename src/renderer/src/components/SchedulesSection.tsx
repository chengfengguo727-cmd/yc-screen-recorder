import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ScheduleEntry, ScheduleType, NextFireInfo } from '../../../preload'

function randomId(): string {
  return 's_' + Math.random().toString(36).slice(2, 10)
}

function fmtDateTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toDatetimeLocal(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(s: string): number {
  return new Date(s).getTime()
}

function computeNextFire(s: ScheduleEntry, fromMs: number): number | null {
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

function useWeekNames(): string[] {
  const { t } = useTranslation()
  return [
    t('schedule.weekSun'),
    t('schedule.weekMon'),
    t('schedule.weekTue'),
    t('schedule.weekWed'),
    t('schedule.weekThu'),
    t('schedule.weekFri'),
    t('schedule.weekSat')
  ]
}

function useSummary(): (s: ScheduleEntry) => string {
  const { t } = useTranslation()
  const weekNames = useWeekNames()
  return (s: ScheduleEntry): string => {
    if (s.type === 'once' && s.fireAt) return t('schedule.summaryOnce', { at: fmtDateTime(s.fireAt) })
    if (s.type === 'daily' && s.hour != null && s.minute != null) {
      const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
      return t('schedule.summaryDaily', { time })
    }
    if (s.type === 'weekly' && s.hour != null && s.minute != null) {
      const days =
        (s.daysOfWeek ?? [])
          .slice()
          .sort()
          .map((d) => weekNames[d])
          .join(' / ') || `(${t('common.none')})`
      const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
      return t('schedule.summaryWeekly', { days, time })
    }
    return t('schedule.summaryIncomplete')
  }
}

function useEntryStatus(): (s: ScheduleEntry, now: number) => string {
  const { t } = useTranslation()
  const humanDelta = useHumanDelta()
  return (s: ScheduleEntry, now: number): string => {
    if (!s.enabled) {
      if (s.type === 'once' && s.lastFiredAt)
        return t('schedule.statusFired', { at: fmtDateTime(s.lastFiredAt) })
      return t('schedule.statusDisabled')
    }
    const next = computeNextFire(s, now)
    if (next == null) {
      if (s.type === 'once') return t('schedule.statusOverdue')
      return t('schedule.statusNoFuture')
    }
    return t('schedule.statusNext', { at: fmtDateTime(next), delta: humanDelta(next - now) })
  }
}

function newEntry(name: string): ScheduleEntry {
  const now = new Date()
  return {
    id: randomId(),
    name,
    enabled: true,
    type: 'daily',
    hour: now.getHours(),
    minute: 0,
    daysOfWeek: [1, 2, 3, 4, 5],
    fireAt: Date.now() + 60 * 60_000,
    durationMinutes: 30
  }
}

interface EditorProps {
  entry: ScheduleEntry
  onChange: (e: ScheduleEntry) => void
  onDelete: () => void
  onClose: () => void
}

function ScheduleEditor({ entry, onChange, onDelete, onClose }: EditorProps): React.JSX.Element {
  const { t } = useTranslation()
  const weekNames = useWeekNames()
  return (
    <div className="schedule-editor">
      <div className="opt-row">
        <label style={{ flex: 1 }}>
          {t('schedule.name')}
          <input
            type="text"
            className="opt-text"
            value={entry.name}
            onChange={(e) => onChange({ ...entry, name: e.target.value })}
          />
        </label>
      </div>
      <div className="opt-row">
        <label>
          {t('schedule.type')}
          <select
            value={entry.type}
            onChange={(e) => onChange({ ...entry, type: e.target.value as ScheduleType })}
          >
            <option value="once">{t('schedule.typeOnce')}</option>
            <option value="daily">{t('schedule.typeDaily')}</option>
            <option value="weekly">{t('schedule.typeWeekly')}</option>
          </select>
        </label>
        {entry.type === 'once' && (
          <label style={{ flex: 1 }}>
            {t('schedule.dateTime')}
            <input
              type="datetime-local"
              className="opt-text"
              value={toDatetimeLocal(entry.fireAt ?? Date.now() + 60 * 60_000)}
              onChange={(e) => onChange({ ...entry, fireAt: fromDatetimeLocal(e.target.value) })}
            />
          </label>
        )}
        {(entry.type === 'daily' || entry.type === 'weekly') && (
          <>
            <label>
              {t('schedule.hour')}
              <input
                type="number"
                className="opt-text opt-num"
                min={0}
                max={23}
                value={entry.hour ?? 0}
                onChange={(e) =>
                  onChange({ ...entry, hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })
                }
              />
            </label>
            <label>
              {t('schedule.minute')}
              <input
                type="number"
                className="opt-text opt-num"
                min={0}
                max={59}
                value={entry.minute ?? 0}
                onChange={(e) =>
                  onChange({ ...entry, minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })
                }
              />
            </label>
          </>
        )}
      </div>
      {entry.type === 'weekly' && (
        <div className="opt-row">
          <span style={{ fontSize: 12, color: '#a9b0bc' }}>{t('schedule.weekdays')}</span>
          {weekNames.map((name, idx) => {
            const checked = (entry.daysOfWeek ?? []).includes(idx)
            return (
              <label key={idx} className="checkbox" style={{ marginRight: 6 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const days = new Set(entry.daysOfWeek ?? [])
                    if (e.target.checked) days.add(idx)
                    else days.delete(idx)
                    onChange({ ...entry, daysOfWeek: Array.from(days).sort() })
                  }}
                />
                {name}
              </label>
            )
          })}
        </div>
      )}
      <div className="opt-row">
        <label>
          {t('schedule.durationLabel')}
          <input
            type="number"
            className="opt-text opt-num"
            min={1}
            step={1}
            value={entry.durationMinutes}
            onChange={(e) =>
              onChange({ ...entry, durationMinutes: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </label>
        <span>{t('options.minutes')}</span>
        <div style={{ flex: 1 }} />
        <button className="btn-small" onClick={onDelete}>
          {t('schedule.delete')}
        </button>
        <button className="btn-small" onClick={onClose}>
          {t('schedule.finishEdit')}
        </button>
      </div>
    </div>
  )
}

export function SchedulesSection(): React.JSX.Element {
  const { t } = useTranslation()
  const humanDelta = useHumanDelta()
  const summarize = useSummary()
  const entryStatus = useEntryStatus()
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
  const [next, setNext] = useState<NextFireInfo | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const refresh = async (): Promise<void> => {
    const list = await window.api.listSchedules()
    setSchedules(list)
    const n = await window.api.getNextScheduleFire()
    setNext(n)
  }

  useEffect(() => {
    void refresh()
    const id = setInterval(() => {
      void refresh()
      setNow(Date.now())
    }, 5000)
    return () => clearInterval(id)
  }, [])

  const persist = async (nextList: ScheduleEntry[]): Promise<void> => {
    setSchedules(nextList)
    await window.api.saveSchedules(nextList)
    const n = await window.api.getNextScheduleFire()
    setNext(n)
    setNow(Date.now())
  }

  const onAdd = async (): Promise<void> => {
    const e = newEntry(t('schedule.namePlaceholder'))
    await persist([...schedules, e])
    setEditingId(e.id)
  }

  const onToggle = async (id: string, enabled: boolean): Promise<void> => {
    await persist(schedules.map((s) => (s.id === id ? { ...s, enabled } : s)))
  }

  const onChange = async (id: string, updated: ScheduleEntry): Promise<void> => {
    await persist(schedules.map((s) => (s.id === id ? updated : s)))
  }

  const onDelete = async (id: string): Promise<void> => {
    if (!confirm(t('schedule.deleteConfirm'))) return
    await persist(schedules.filter((s) => s.id !== id))
    if (editingId === id) setEditingId(null)
  }

  return (
    <section className="opt-section">
      <h3>{t('schedule.title')}</h3>
      {next ? (
        <div className="opt-hint">
          {t('schedule.nextFire')}
          <strong>{fmtDateTime(next.fireAt)}</strong> · {next.name} · {next.durationMinutes}{' '}
          {t('options.minutes')}（{humanDelta(next.fireAt - now)}）
        </div>
      ) : (
        <div className="opt-hint">{t('schedule.noSchedule')}</div>
      )}
      <div className="opt-hint" style={{ marginBottom: 8 }}>
        {t('schedule.appOpenHint')}
      </div>
      <ul className="schedules">
        {schedules.map((s) => (
          <li key={s.id} className={editingId === s.id ? 'editing' : ''}>
            <div className="schedule-row">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) => onToggle(s.id, e.target.checked)}
                />
              </label>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rec-name">{s.name}</div>
                <div className="rec-meta">
                  {summarize(s)} · {s.durationMinutes} {t('options.minutes')}
                </div>
                <div className="rec-meta">{entryStatus(s, now)}</div>
              </div>
              <button
                className="btn-small"
                onClick={() => setEditingId(editingId === s.id ? null : s.id)}
              >
                {editingId === s.id ? t('schedule.collapse') : t('schedule.expand')}
              </button>
            </div>
            {editingId === s.id && (
              <ScheduleEditor
                entry={s}
                onChange={(e) => onChange(s.id, e)}
                onDelete={() => onDelete(s.id)}
                onClose={() => setEditingId(null)}
              />
            )}
          </li>
        ))}
      </ul>
      <button className="btn-small" onClick={onAdd}>
        {t('schedule.addNew')}
      </button>
    </section>
  )
}
