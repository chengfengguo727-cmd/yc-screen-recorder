import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store'

const LANGUAGES = [
  { value: 'auto', label: '自動偵測' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' }
]

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
      alert(`下載失敗：${(e as Error).message}`)
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
      <div className="panel-title">即時轉錄 (STT)</div>
      <div className="stt-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={sttEnabled}
            disabled={isRecording || !selectedModel?.installed || (!micEnabled && !systemEnabled)}
            onChange={(e) => setSttEnabled(e.target.checked)}
          />
          錄影時即時生成 SRT
        </label>
        {!micEnabled && !systemEnabled && (
          <span className="warn">需先啟用麥克風或系統音</span>
        )}
      </div>
      <div className="stt-row">
        <label>
          模型
          <select
            value={selectedWhisperKey ?? ''}
            disabled={isRecording}
            onChange={(e) => setSelectedWhisperKey(e.target.value || null)}
          >
            {whisperModels.map((m) => (
              <option key={m.key} value={m.key}>
                {m.key} {m.installed ? '✓' : `(${formatBytes(m.sizeBytes)})`}
              </option>
            ))}
          </select>
        </label>
        <label>
          語言
          <select
            value={whisperLanguage}
            disabled={isRecording}
            onChange={(e) => setWhisperLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          佇列秒數
          <select
            value={whisperQueueSeconds}
            disabled={isRecording}
            onChange={(e) => setWhisperQueueSeconds(Number(e.target.value))}
          >
            <option value={2}>2 (即時)</option>
            <option value={3}>3 (預設)</option>
            <option value={5}>5</option>
            <option value={8}>8 (準確)</option>
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
                  : '連線中…'}
              </span>
              <button className="btn-small" onClick={() => onCancel(selectedModel.key)}>
                取消
              </button>
            </>
          ) : (
            <button className="btn btn-record" onClick={() => onDownload(selectedModel.key)}>
              下載模型 ({formatBytes(selectedModel.sizeBytes)})
            </button>
          )}
        </div>
      )}
      <div className="transcript-box">
        {transcriptSegments.length === 0 ? (
          <div className="empty">
            {sttEnabled ? '錄影開始後 whisper filter 會在此即時顯示…' : '尚未啟用'}
          </div>
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
