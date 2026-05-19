import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'

function formatBytes(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`
}

export function TranscriptPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    whisperModels,
    selectedWhisperKey,
    whisperLanguage,
    whisperQueueSeconds,
    sttEnabled,
    modelDownload,
    transcriptSegments,
    micEnabled,
    systemEnabled,
    session,
    refreshWhisperModels,
    setSelectedWhisperKey,
    setWhisperLanguage,
    setWhisperQueueSeconds,
    setSttEnabled,
    setModelDownload
  } = useAppStore()

  const languages = [
    { value: 'auto', label: t('stt.languageAuto') },
    { value: 'zh', label: t('stt.langZh') },
    { value: 'en', label: t('stt.langEn') },
    { value: 'ja', label: t('stt.langJa') },
    { value: 'ko', label: t('stt.langKo') }
  ]

  const [downloading, setDownloading] = useState<string | null>(null)
  const isRecording = session.status === 'recording' || session.status === 'starting'

  useEffect(() => {
    void refreshWhisperModels()
  }, [refreshWhisperModels])

  const selectedModel = useMemo(
    () => whisperModels.find((m) => m.key === selectedWhisperKey) ?? null,
    [whisperModels, selectedWhisperKey]
  )

  const onDownload = async (key: string): Promise<void> => {
    setDownloading(key)
    try {
      await window.api.downloadWhisperModel(key)
      await refreshWhisperModels()
    } catch (e) {
      alert(`${t('common.error')}: ${(e as Error).message}`)
    } finally {
      setDownloading(null)
      setModelDownload(null)
    }
  }

  const onCancel = (key: string): void => {
    window.api.cancelWhisperDownload(key)
  }

  return (
    <div className="panel">
      <div className="panel-title">{t('stt.title')}</div>
      <div className="stt-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={sttEnabled}
            disabled={isRecording || !selectedModel?.installed || (!micEnabled && !systemEnabled)}
            onChange={(e) => setSttEnabled(e.target.checked)}
          />
          {t('stt.enable')}
        </label>
        {!micEnabled && !systemEnabled && <span className="warn">{t('stt.needAudio')}</span>}
      </div>
      <div className="stt-row">
        <label>
          {t('stt.model')}
          <select
            value={selectedWhisperKey ?? ''}
            disabled={isRecording}
            onChange={(e) => setSelectedWhisperKey(e.target.value || null)}
          >
            {whisperModels.map((m) => (
              <option key={m.key} value={m.key}>
                {m.key} {m.installed ? t('stt.modelInstalled') : `(${formatBytes(m.sizeBytes)})`}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('stt.language')}
          <select
            value={whisperLanguage}
            disabled={isRecording}
            onChange={(e) => setWhisperLanguage(e.target.value)}
          >
            {languages.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('stt.queueSeconds')}
          <select
            value={whisperQueueSeconds}
            disabled={isRecording}
            onChange={(e) => setWhisperQueueSeconds(Number(e.target.value))}
          >
            <option value={2}>{t('stt.queue2')}</option>
            <option value={3}>{t('stt.queue3')}</option>
            <option value={5}>{t('stt.queue5')}</option>
            <option value={8}>{t('stt.queue8')}</option>
          </select>
        </label>
      </div>
      {selectedModel && !selectedModel.installed && (
        <div className="stt-row">
          {downloading === selectedModel.key ? (
            <>
              <div className="download-progress">
                <div
                  className="download-fill"
                  style={{
                    width: modelDownload
                      ? `${(modelDownload.received / modelDownload.total) * 100}%`
                      : '5%'
                  }}
                />
              </div>
              <span className="volume-label">
                {modelDownload
                  ? `${formatBytes(modelDownload.received)} / ${formatBytes(modelDownload.total)}`
                  : t('stt.connecting')}
              </span>
              <button className="btn-small" onClick={() => onCancel(selectedModel.key)}>
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <button className="btn btn-record" onClick={() => onDownload(selectedModel.key)}>
              {t('stt.downloadModel', { size: formatBytes(selectedModel.sizeBytes) })}
            </button>
          )}
        </div>
      )}
      <div className="transcript-box">
        {transcriptSegments.length === 0 ? (
          <div className="empty">{sttEnabled ? t('stt.emptyEnabled') : t('stt.emptyDisabled')}</div>
        ) : (
          <ul>
            {transcriptSegments.slice(-50).map((s) => (
              <li key={s.index}>
                <span className="ts-time">[{formatTime(s.start)}]</span> {s.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
