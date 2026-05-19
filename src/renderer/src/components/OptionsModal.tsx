import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import { SchedulesSection } from './SchedulesSection'
import { SUPPORTED_LANGS, setLanguage, type UILang } from '../i18n'

interface Props {
  open: boolean
  onClose: () => void
}

export function OptionsModal({ open, onClose }: Props): React.JSX.Element | null {
  const { t } = useTranslation()
  const { preferences, reloadPreferences } = useAppStore()
  const [outputDir, setOutputDir] = useState<string>('')
  const [resolvedDir, setResolvedDir] = useState<string>('')
  const [maxMinutes, setMaxMinutes] = useState<number>(600)
  const [autoLaunch, setAutoLaunch] = useState<boolean>(false)
  const [autoStartRecording, setAutoStartRecording] = useState<boolean>(false)
  const [startMinimized, setStartMinimized] = useState<boolean>(true)
  const [uiLanguage, setUiLanguage] = useState<UILang>('zh-TW')
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
      setUiLanguage((prefs.uiLanguage as UILang) || 'zh-TW')
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

  const onLangChange = (code: UILang): void => {
    setUiLanguage(code)
    setLanguage(code) // live preview
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
        startMinimized,
        uiLanguage
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
    if (!confirm(t('options.resetConfirm'))) return
    await window.api.resetPreferences()
    await reloadPreferences()
    const prefs = await window.api.getPreferences()
    const current = await window.api.getCurrentOutputDir()
    setOutputDir(prefs.outputDir ?? '')
    setResolvedDir(current)
    setMaxMinutes(prefs.maxRecordingMinutes)
    setUiLanguage((prefs.uiLanguage as UILang) || 'zh-TW')
    setLanguage((prefs.uiLanguage as UILang) || 'zh-TW')
    setDirty(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>{t('options.title')}</div>
          <button className="btn-small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <section className="opt-section">
            <h3>{t('options.language')}</h3>
            <div className="opt-row">
              <select value={uiLanguage} onChange={(e) => onLangChange(e.target.value as UILang)}>
                {SUPPORTED_LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="opt-section">
            <h3>{t('options.outputDir')}</h3>
            <div className="opt-row">
              <input
                type="text"
                className="opt-text"
                value={outputDir}
                placeholder={t('options.outputDirPlaceholder')}
                onChange={(e) => {
                  setOutputDir(e.target.value)
                  setDirty(true)
                }}
              />
              <button className="btn-small" onClick={onPickDir}>
                {t('options.browse')}
              </button>
              <button className="btn-small" onClick={onResetDir}>
                {t('options.useDefault')}
              </button>
            </div>
            <div className="opt-hint">{t('options.currentPath', { path: resolvedDir })}</div>
          </section>

          <section className="opt-section">
            <h3>{t('options.maxRecording')}</h3>
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
              <span>{t('options.minutes')}</span>
              <button
                className="btn-small"
                onClick={() => {
                  setMaxMinutes(600)
                  setDirty(true)
                }}
              >
                {t('options.defaultTenHour')}
              </button>
              <button
                className="btn-small"
                onClick={() => {
                  setMaxMinutes(0)
                  setDirty(true)
                }}
              >
                {t('options.noLimit')}
              </button>
            </div>
            <div className="opt-hint">{t('options.maxRecordingHint')}</div>
          </section>

          <section className="opt-section">
            <h3>{t('options.startup')}</h3>
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
                {t('options.autoLaunch')}
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
                {t('options.startMinimized')}
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
                {t('options.autoStartRecording')}
              </label>
            </div>
          </section>

          <SchedulesSection />

          {preferences && (
            <section className="opt-section">
              <h3>{t('options.about')}</h3>
              <div className="opt-hint">{t('options.aboutHint', { version: __APP_VERSION__ })}</div>
            </section>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-small" onClick={onResetAll}>
            {t('options.resetAll')}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn-small" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-record" disabled={saving} onClick={onSave}>
            {saving ? t('options.saving') : dirty ? t('options.saveBtn') : t('options.doneBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}
