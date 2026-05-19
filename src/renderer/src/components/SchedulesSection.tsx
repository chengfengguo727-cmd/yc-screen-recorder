import { useEffect, useState } from 'react'
import type { ScheduleEntry, ScheduleType, NextFireInfo } from '../../../preload'

const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六']

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

// Renderer-side mirror of main/scheduler.ts:computeNextFire
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

function humanDelta(ms: number): string {
  if (ms < 60_000) return '< 1 分鐘'
  const totalMin = Math.round(ms / 60_000)
  if (totalMin < 60) return `${totalMin} 分後`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h < 24) return m > 0 ? `${h} 小時 ${m} 分後` : `${h} 小時後`
  const d = Math.floor(h / 24)
  const hh = h % 24
  return hh > 0 ? `${d} 天 ${hh} 小時後` : `${d} 天後`
}

function summarize(s: ScheduleEntry): string {
  if (s.type === 'once' && s.fireAt) return `一次性 · ${fmtDateTime(s.fireAt)}`
  if (s.type === 'daily' && s.hour != null && s.minute != null) {
    return `每日 ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
  }
  if (s.type === 'weekly' && s.hour != null && s.minute != null) {
    const days = (s.daysOfWeek ?? []).sort().map((d) => WEEK_NAMES[d]).join('、')
    return `每週 ${days || '(無)'} ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
  }
  return '(設定不完整)'
}

function entryStatus(s: ScheduleEntry, now: number): string {
  if (!s.enabled) {
    if (s.type === 'once' && s.lastFiredAt) return `⏹ 已觸發過 · ${fmtDateTime(s.lastFiredAt)}`
    return '⏸ 已停用'
  }
  const next = computeNextFire(s, now)
  if (next == null) {
    if (s.type === 'once') return '⚠ 一次性時間已過'
    return '⚠ 無未來觸發時間'
  }
  return `⏱ 下次：${fmtDateTime(next)}（${humanDelta(next - now)}）`
}

function newEntry(): ScheduleEntry {
  const now = new Date()
  return {
    id: randomId(),
    name: '排程錄影',
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
  return (
    <div className="schedule-editor">
      <div className="opt-row">
        <label style={{ flex: 1 }}>
          名稱
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
          類型
          <select
            value={entry.type}
            onChange={(e) => onChange({ ...entry, type: e.target.value as ScheduleType })}
          >
            <option value="once">一次性</option>
            <option value="daily">每日</option>
            <option value="weekly">每週</option>
          </select>
        </label>
        {entry.type === 'once' && (
          <label style={{ flex: 1 }}>
            日期時間
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
              時
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
              分
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
          <span style={{ fontSize: 12, color: '#a9b0bc' }}>星期：</span>
          {WEEK_NAMES.map((name, idx) => {
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
          錄影長度
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
        <span>分鐘</span>
        <div style={{ flex: 1 }} />
        <button className="btn-small" onClick={onDelete}>
          🗑 刪除
        </button>
        <button className="btn-small" onClick={onClose}>
          ✓ 完成
        </button>
      </div>
    </div>
  )
}

export function SchedulesSection(): React.JSX.Element {
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
    const e = newEntry()
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
    if (!confirm('刪除這個排程？')) return
    await persist(schedules.filter((s) => s.id !== id))
    if (editingId === id) setEditingId(null)
  }

  return (
    <section className="opt-section">
      <h3>排程錄影</h3>
      {next ? (
        <div className="opt-hint">
          下一次觸發：<strong>{fmtDateTime(next.fireAt)}</strong> · {next.name} · {next.durationMinutes} 分鐘（{humanDelta(next.fireAt - now)}）
        </div>
      ) : schedules.length > 0 ? (
        <div className="opt-hint">所有排程都已過期或已停用</div>
      ) : (
        <div className="opt-hint">目前無排程</div>
      )}
      <div className="opt-hint" style={{ marginBottom: 8 }}>
        提示：排程觸發時應用程式必須是開啟狀態（可以最小化）。錄影使用主視窗目前的螢幕/音源/編碼器設定。
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
                  {summarize(s)} · 錄 {s.durationMinutes} 分
                </div>
                <div className="rec-meta">{entryStatus(s, now)}</div>
              </div>
              <button
                className="btn-small"
                onClick={() => setEditingId(editingId === s.id ? null : s.id)}
              >
                {editingId === s.id ? '收起' : '編輯'}
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
        + 新增排程
      </button>
    </section>
  )
}
