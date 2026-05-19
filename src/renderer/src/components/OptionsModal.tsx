import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { SchedulesSection } from './SchedulesSection'

interface Props {
  open: boolean
  onClose: () => void
}

export function OptionsModal({ open, onClose }: Props): React.JSX.Element | null {
  const { preferences, reloadPreferences } = useAppStore()
  const [outputDir, setOutputDir] = useState<string>('')
  const [resolvedDir, setResolvedDir] = useState<string>('')
  const [maxMinutes, setMaxMinutes] = useState<number>(600)
  const [autoLaunch, setAutoLaunch] = useState<boolean>(false)
  const [autoStartRecording, setAutoStartRecording] = useState<boolean>(false)
  const [startMinimized, setStartMinimized] = useState<boolean>(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    void (async (): Promise<void> => {
      const prefs = await window.api.getPreferences()
      const current = await window.api.getCurrentOutputDir()
      setOutputDir(prefs.outputDir ?? '')
      setResolvedDir(current)
      setMaxMinutes(prefs.maxRecordingMinutes)
      setAutoLaunch(prefs.autoLaunch)
      setAutoStartRecording(prefs.autoStartRecording)
      setStartMinimized(prefs.startMinimized)
      setDirty(false)
    })()
  }, [open])

  if (!open) return null

  const onPickDir = async (): Promise<void> => {
    const picked = await window.api.pickOutputDir()
    if (picked) {
      setOutputDir(picked)
      setDirty(true)
    }
  }

  const onResetDir = (): void => {
    setOutputDir('')
    setDirty(true)
  }

  const onSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.setPreferences({
        outputDir: outputDir.trim() === '' ? null : outputDir.trim(),
        maxRecordingMinutes: maxMinutes,
        autoLaunch,
        autoStartRecording,
        startMinimized
      })
      await window.api.applyLoginItem()
      const newDir = await window.api.getCurrentOutputDir()
      setResolvedDir(newDir)
      await reloadPreferences()
      setDirty(false)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const onResetAll = async (): Promise<void> => {
    if (!confirm('確定要把所有設定還原成預設值嗎？')) return
    await window.api.resetPreferences()
    await reloadPreferences()
    const prefs = await window.api.getPreferences()
    const current = await window.api.getCurrentOutputDir()
    setOutputDir(prefs.outputDir ?? '')
    setResolvedDir(current)
    setMaxMinutes(prefs.maxRecordingMinutes)
    setDirty(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>設定</div>
          <button className="btn-small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <section className="opt-section">
            <h3>輸出資料夾</h3>
            <div className="opt-row">
              <input
                type="text"
                className="opt-text"
                value={outputDir}
                placeholder="(使用預設 userData/recordings)"
                onChange={(e) => {
                  setOutputDir(e.target.value)
                  setDirty(true)
                }}
              />
              <button className="btn-small" onClick={onPickDir}>
                瀏覽…
              </button>
              <button className="btn-small" onClick={onResetDir}>
                使用預設
              </button>
            </div>
            <div className="opt-hint">目前生效路徑：{resolvedDir}</div>
          </section>

          <section className="opt-section">
            <h3>最大錄影長度</h3>
            <div className="opt-row">
              <input
                type="number"
                className="opt-text opt-num"
                min={0}
                step={1}
                value={maxMinutes}
                onChange={(e) => {
                  setMaxMinutes(Math.max(0, Number(e.target.value) || 0))
                  setDirty(true)
                }}
              />
              <span>分鐘</span>
              <button
                className="btn-small"
                onClick={() => {
                  setMaxMinutes(600)
                  setDirty(true)
                }}
              >
                預設 (10 小時)
              </button>
              <button
                className="btn-small"
                onClick={() => {
                  setMaxMinutes(0)
                  setDirty(true)
                }}
              >
                不限制
              </button>
            </div>
            <div className="opt-hint">
              超過後會自動結束本檔，立即接續錄到新檔（檔名以時間戳區分）。設 0 代表不限制。
            </div>
          </section>

          <section className="opt-section">
            <h3>啟動行為</h3>
            <div className="opt-row">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={autoLaunch}
                  onChange={(e) => {
                    setAutoLaunch(e.target.checked)
                    setDirty(true)
                  }}
                />
                開機時自動啟動 YC Screen Recorder
              </label>
            </div>
            <div className="opt-row">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={startMinimized}
                  disabled={!autoLaunch}
                  onChange={(e) => {
                    setStartMinimized(e.target.checked)
                    setDirty(true)
                  }}
                />
                自動啟動時直接縮到工作匣（不彈視窗）
              </label>
            </div>
            <div className="opt-row">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={autoStartRecording}
                  disabled={!autoLaunch}
                  onChange={(e) => {
                    setAutoStartRecording(e.target.checked)
                    setDirty(true)
                  }}
                />
                自動啟動後立即開始錄影（使用主視窗目前的螢幕/音源/編碼設定）
              </label>
            </div>
            <div className="opt-hint">
              啟用後會在 Windows 啟動清單註冊本程式。要徹底取消請取消勾選並儲存（會自動清掉註冊）。
            </div>
          </section>

          <SchedulesSection />

          {preferences && (
            <section className="opt-section">
              <h3>關於</h3>
              <div className="opt-hint">
                版本 v{__APP_VERSION__} · 設定檔：%AppData%\screen-recorder\preferences.json
              </div>
            </section>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-small" onClick={onResetAll}>
            還原所有設定
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn-small" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-record" disabled={saving} onClick={onSave}>
            {saving ? '儲存中…' : dirty ? '儲存' : '完成'}
          </button>
        </div>
      </div>
    </div>
  )
}
