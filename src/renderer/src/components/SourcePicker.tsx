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
    setRegion,
    refreshThumbnails,
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

  return (
    <div className="panel">
      <div className="panel-title">
        {t('sourcePicker.title')}
        <button className="btn-small" onClick={() => refreshThumbnails()}>
          ↻
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
            <button
              key={d.displayId}
              className={`display-card ${selectedDisplayId === d.displayId ? 'selected' : ''}`}
              onClick={() => setSelectedDisplayId(d.displayId)}
            >
              {thumbForDisplay(d.displayId) ? (
                <img src={thumbForDisplay(d.displayId)} alt={d.label} />
              ) : (
                <div className="thumb-placeholder">{t('sourcePicker.noPreview')}</div>
              )}
              <div className="display-label">{d.label}</div>
              <div className="display-meta">
                output_idx={d.outputIdx} · ({d.bounds.x},{d.bounds.y})
              </div>
            </button>
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
