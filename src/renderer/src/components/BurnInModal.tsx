import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BurnProgress, RecordingFile } from '../../../preload'

interface Props {
  target: RecordingFile | null
  onClose: () => void
  onDone: () => void
}

const FONT_OPTIONS = [
  'Microsoft JhengHei',
  'Microsoft YaHei',
  'Noto Sans CJK TC',
  'Noto Sans CJK SC',
  'Arial',
  'PingFang TC',
  'PingFang SC'
]

function defaultOutputName(input: string): string {
  return input.replace(/\.mp4$/i, '-subs.mp4')
}

function formatSpeed(speed: string): string {
  return speed?.replace(/x$/, 'x') ?? ''
}

export function BurnInModal({ target, onClose, onDone }: Props): React.JSX.Element | null {
  const { t } = useTranslation()
  const [fontName, setFontName] = useState('Microsoft JhengHei')
  const [fontSize, setFontSize] = useState(24)
  const [outline, setOutline] = useState(2)
  const [bitrate, setBitrate] = useState('12M')
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<BurnProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outputPath, setOutputPath] = useState<string>('')

  useEffect(() => {
    if (!target) return
    setOutputPath(defaultOutputName(target.path))
    setError(null)
    setProgress(null)
    setJobId(null)
  }, [target])

  useEffect(() => {
    const offP = window.api.onBurnProgress((p) => {
      if (p.jobId === jobId) setProgress(p)
    })
    const offD = window.api.onBurnDone((info) => {
      if (info.jobId === jobId) {
        setProgress((prev) => (prev ? { ...prev, percent: 100 } : null))
        setTimeout(() => {
          onDone()
          onClose()
        }, 600)
      }
    })
    const offE = window.api.onBurnError((info) => {
      if (info.jobId === jobId) {
        setError(info.error)
        setJobId(null)
      }
    })
    return () => {
      offP()
      offD()
      offE()
    }
  }, [jobId, onClose, onDone])

  if (!target) return null

  const start = async (): Promise<void> => {
    if (!target.srtPath) {
      setError(t('burnIn.noSrt'))
      return
    }
    setError(null)
    setProgress(null)
    const res = await window.api.burnInStart({
      inputMp4: target.path,
      inputSrt: target.srtPath,
      outputMp4: outputPath,
      fontName,
      fontSize,
      outline,
      bitrate
    })
    setJobId(res.jobId)
  }

  const cancel = (): void => {
    if (jobId) {
      window.api.burnInCancel(jobId)
      setJobId(null)
      setProgress(null)
    }
  }

  const running = jobId !== null
  const pct = progress?.percent ?? 0

  return (
    <div className="modal-backdrop" onClick={running ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>{t('burnIn.title')}</div>
          <button className="btn-small" disabled={running} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <section className="opt-section">
            <h3>{t('burnIn.source')}</h3>
            <div className="opt-hint">{target.name}</div>
            <div className="opt-hint">
              {t('burnIn.subtitle', {
                name: target.srtPath ? target.srtPath.split(/[\\/]/).pop() : t('burnIn.subtitleMissing')
              })}
            </div>
          </section>

          <section className="opt-section">
            <h3>{t('burnIn.outputName')}</h3>
            <input
              type="text"
              className="opt-text"
              value={outputPath}
              disabled={running}
              onChange={(e) => setOutputPath(e.target.value)}
            />
          </section>

          <section className="opt-section">
            <h3>{t('burnIn.style')}</h3>
            <div className="stt-row">
              <label>
                {t('burnIn.fontName')}
                <select
                  value={fontName}
                  disabled={running}
                  onChange={(e) => setFontName(e.target.value)}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('burnIn.fontSize')}
                <select
                  value={fontSize}
                  disabled={running}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                >
                  {[18, 20, 22, 24, 28, 32, 36, 42, 48].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('burnIn.outline')}
                <select
                  value={outline}
                  disabled={running}
                  onChange={(e) => setOutline(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('burnIn.bitrate')}
                <select
                  value={bitrate}
                  disabled={running}
                  onChange={(e) => setBitrate(e.target.value)}
                >
                  <option value="200K">0.2 Mbps</option>
                  <option value="500K">0.5 Mbps</option>
                  <option value="1M">1 Mbps</option>
                  <option value="3M">3 Mbps</option>
                  <option value="6M">6 Mbps</option>
                  <option value="12M">12 Mbps</option>
                  <option value="20M">20 Mbps</option>
                  <option value="40M">40 Mbps</option>
                </select>
              </label>
            </div>
          </section>

          {(running || progress) && (
            <section className="opt-section">
              <h3>{t('burnIn.progress')}</h3>
              <div className="download-progress">
                <div className="download-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="opt-hint">
                {pct.toFixed(1)}% · {formatSpeed(progress?.speed ?? '')} · {progress?.fps ?? 0} fps
              </div>
            </section>
          )}

          {error && (
            <section className="opt-section">
              <div className="warn">
                {t('common.error')}: {error}
              </div>
            </section>
          )}
        </div>
        <div className="modal-footer">
          {!running ? (
            <>
              <div style={{ flex: 1 }} />
              <button className="btn-small" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-record" onClick={start} disabled={!target.srtPath}>
                {t('burnIn.start')}
              </button>
            </>
          ) : (
            <>
              <div style={{ flex: 1 }} />
              <button className="btn btn-stop" onClick={cancel}>
                {t('burnIn.cancel')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
