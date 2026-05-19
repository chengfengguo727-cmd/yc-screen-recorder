import { useEffect } from 'react'
import { useAppStore } from '../store'

const THUMBNAIL_REFRESH_MS = 5000

export function SourcePicker(): React.JSX.Element {
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
        擷取來源
        <button className="btn-small" onClick={() => refreshThumbnails()}>
          ↻
        </button>
      </div>
      <div className="mode-tabs">
        <button className={mode === 'display' ? 'active' : ''} onClick={() => setMode('display')}>
          單一螢幕
        </button>
        <button
          className={mode === 'virtual-desktop' ? 'active' : ''}
          onClick={() => setMode('virtual-desktop')}
        >
          整個虛擬桌面
        </button>
        <button className={mode === 'region' ? 'active' : ''} onClick={() => setMode('region')}>
          區域
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
                <div className="thumb-placeholder">no preview</div>
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
          整個虛擬桌面（{displays.length} 顆螢幕水平拼接）
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
            🎯 選取錄影範圍
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
                清除選擇
              </button>
            </div>
          ) : region ? (
            <div className="region-summary">
              <div className="display-meta">
                {region.width} × {region.height} @ ({region.offsetX}, {region.offsetY}) (display id {region.displayId})
              </div>
              <button className="btn-small" onClick={() => setRegion(null)}>
                清除選擇
              </button>
            </div>
          ) : (
            <div className="display-meta">尚未選取，點上方按鈕開始拖框</div>
          )}
        </div>
      )}
    </div>
  )
}
