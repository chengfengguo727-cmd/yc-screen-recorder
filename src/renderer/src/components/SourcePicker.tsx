import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'

const THUMBNAIL_REFRESH_MS = 5000

export function SourcePicker(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    displays,
    thumbnails,
    mode,
    selectedDisplayId,
    region,
    setMode,
    setSelectedDisplayId,
    setOutputOverride,
    redetectDisplays,
    setRegion,
    refreshThumbnails,
    framerate,
    session
  } = useAppStore()

  useEffect(() => {
    if (session.status === 'recording' || session.status === 'starting') return undefined
    const id = setInterval(() => {
      void refreshThumbnails()
    }, THUMBNAIL_REFRESH_MS)
    return () => clearInterval(id)
  }, [refreshThumbnails, session.status])

  const thumbForDisplay = (displayId: number): string | undefined => {
    const t = thumbnails.find((x) => x.display_id === String(displayId))
    return t?.thumbnail
  }

  const onPickRegion = async (): Promise<void> => {
    const result = await window.api.pickRegion()
    if (result) setRegion(result)
  }

  const regionDisplay = region ? displays.find((d) => d.displayId === region.displayId) : null
  // ddagrab indexes outputs 0..N-1; offer at least as many slots as displays
  const outputCount = Math.max(displays.length, ...displays.map((d) => d.outputIdx + 1), 1)
  const outputChoices = Array.from({ length: outputCount }, (_, i) => i)

  return (
    <div className="panel">
      <div className="panel-title">
        {t('sourcePicker.title')}
        <button className="btn-small" onClick={() => refreshThumbnails()}>
          ↻
        </button>
        <button
          className="btn-small"
          onClick={() => void redetectDisplays()}
          title={t('sourcePicker.redetectTip')}
        >
          {t('sourcePicker.redetect')}
        </button>
      </div>
      <div className="mode-tabs">
        <button className={mode === 'display' ? 'active' : ''} onClick={() => setMode('display')}>
          {t('sourcePicker.modeDisplay')}
        </button>
        <button
          className={mode === 'virtual-desktop' ? 'active' : ''}
          onClick={() => setMode('virtual-desktop')}
        >
          {t('sourcePicker.modeVirtual')}
        </button>
        <button className={mode === 'region' ? 'active' : ''} onClick={() => setMode('region')}>
          {t('sourcePicker.modeRegion')}
        </button>
      </div>

      {mode === 'display' && (
        <div className="display-grid">
          {displays.map((d) => (
            <div
              key={d.displayId}
              role="button"
              tabIndex={0}
              className={`display-card ${selectedDisplayId === d.displayId ? 'selected' : ''}`}
              onClick={() => setSelectedDisplayId(d.displayId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setSelectedDisplayId(d.displayId)
              }}
            >
              {thumbForDisplay(d.displayId) ? (
                <img src={thumbForDisplay(d.displayId)} alt={d.label} />
              ) : (
                <div className="thumb-placeholder">{t('sourcePicker.noPreview')}</div>
              )}
              <div className="display-label">{d.label}</div>
              <div className="display-meta">
                ({d.bounds.x},{d.bounds.y}) · {d.refreshHz}Hz
              </div>
              {d.refreshHz > framerate && selectedDisplayId === d.displayId && (
                <div className="fps-hint" title={t('sourcePicker.fpsHintTip')}>
                  {t('sourcePicker.fpsHint', { fps: framerate, hz: d.refreshHz })}
                </div>
              )}
              <label
                className="output-override"
                onClick={(e) => e.stopPropagation()}
                title={t('sourcePicker.outputIdxHint')}
              >
                output_idx
                <select
                  value={d.outputIdx}
                  onChange={(e) => void setOutputOverride(d.displayId, Number(e.target.value))}
                >
                  {outputChoices.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                {d.manual && (
                  <button
                    className="btn-small"
                    onClick={(e) => {
                      e.stopPropagation()
                      void setOutputOverride(d.displayId, null)
                    }}
                    title={t('sourcePicker.outputIdxAutoTip')}
                  >
                    {t('sourcePicker.outputIdxAuto')}
                  </button>
                )}
              </label>
            </div>
          ))}
        </div>
      )}

      {mode === 'virtual-desktop' && (
        <div className="virtual-info">
          {t('sourcePicker.virtualHint', { count: displays.length })}
          <ul>
            {displays.map((d) => (
              <li key={d.displayId}>{d.label}</li>
            ))}
          </ul>
        </div>
      )}

      {mode === 'region' && (
        <div className="region-info">
          <button className="btn btn-record" onClick={onPickRegion}>
            {t('sourcePicker.pickRegion')}
          </button>
          {region && regionDisplay ? (
            <div className="region-summary">
              <div>
                <strong>{regionDisplay.label}</strong>
              </div>
              <div className="display-meta">
                {region.width} × {region.height} @ ({region.offsetX}, {region.offsetY})
              </div>
              <button className="btn-small" onClick={() => setRegion(null)}>
                {t('sourcePicker.clearSelection')}
              </button>
            </div>
          ) : region ? (
            <div className="region-summary">
              <div className="display-meta">
                {region.width} × {region.height} @ ({region.offsetX}, {region.offsetY}) (display id {region.displayId})
              </div>
              <button className="btn-small" onClick={() => setRegion(null)}>
                {t('sourcePicker.clearSelection')}
              </button>
            </div>
          ) : (
            <div className="display-meta">{t('sourcePicker.regionEmpty')}</div>
          )}
        </div>
      )}
    </div>
  )
}
