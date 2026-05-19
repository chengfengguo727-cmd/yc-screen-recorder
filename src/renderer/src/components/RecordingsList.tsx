import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import { BurnInModal } from './BurnInModal'
import { TrimModal } from './TrimModal'
import type { RecordingFile } from '../../../preload'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function RecordingsList(): React.JSX.Element {
  const { t } = useTranslation()
  const { recordings, refreshRecordings } = useAppStore()
  const [burnTarget, setBurnTarget] = useState<RecordingFile | null>(null)
  const [trimTarget, setTrimTarget] = useState<RecordingFile | null>(null)

  return (
    <div className="panel">
      <div className="panel-title">
        {t('recordings.title')}{' '}
        <button className="btn-small" onClick={() => refreshRecordings()}>↻</button>
      </div>
      {recordings.length === 0 ? (
        <div className="empty">{t('recordings.empty')}</div>
      ) : (
        <ul className="recordings">
          {recordings.map((r) => (
            <li key={r.path}>
              <div className="rec-name">
                <span className="rec-icon">
                  {r.kind === 'image' ? t('recordings.iconImage') : t('recordings.iconVideo')}
                </span>{' '}
                {r.name}
              </div>
              <div className="rec-meta">
                {formatSize(r.size)} · {new Date(r.mtime).toLocaleString()}
                {r.srtPath && ` · ${t('recordings.withSubtitle')}`}
              </div>
              <div className="rec-actions">
                <button className="btn-small" onClick={() => window.api.showInFolder(r.path)}>
                  {t('recordings.openFolder')}
                </button>
                {r.kind === 'video' && (
                  <button className="btn-small" onClick={() => setTrimTarget(r)}>
                    {t('recordings.trim')}
                  </button>
                )}
                {r.kind === 'video' && r.srtPath && (
                  <button className="btn-small" onClick={() => setBurnTarget(r)}>
                    {t('recordings.burnIn')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <BurnInModal target={burnTarget} onClose={() => setBurnTarget(null)} onDone={() => refreshRecordings()} />
      <TrimModal target={trimTarget} onClose={() => setTrimTarget(null)} onDone={() => refreshRecordings()} />
    </div>
  )
}
