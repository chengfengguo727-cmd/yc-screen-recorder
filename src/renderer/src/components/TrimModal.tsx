import { useEffect, useRef, useState } from 'react'
import type { RecordingFile, TrimProgress } from '../../../preload'

interface Props {
  target: RecordingFile | null
  onClose: () => void
  onDone: () => void
}

function pathToFileUrl(p: string): string {
  // Use the custom 'media' protocol registered in main process.
  // Pass the full path as a query param to avoid URL parsing issues with
  // Windows drive letters / colons in the path component.
  return 'media://media/?p=' + encodeURIComponent(p)
}

function defaultOutputName(p: string): string {
  return p.replace(/\.mp4$/i, '-trim.mp4')
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec)) return '00:00.0'
  const total = Math.max(0, sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${s.toFixed(1).padStart(4, '0')}`
  return `${pad(m)}:${s.toFixed(1).padStart(4, '0')}`
}

function parseTime(s: string): number | null {
  const m = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(s.trim())
  if (m) {
    const h = m[1] ? Number(m[1]) : 0
    const mm = Number(m[2])
    const ss = Number(m[3])
    return h * 3600 + mm * 60 + ss
  }
  const num = parseFloat(s)
  return Number.isFinite(num) ? num : null
}

export function TrimModal({ target, onClose, onDone }: Props): React.JSX.Element | null {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [startSec, setStartSec] = useState(0)
  const [endSec, setEndSec] = useState(0)
  const [startInput, setStartInput] = useState('00:00.0')
  const [endInput, setEndInput] = useState('00:00.0')
  const [reencode, setReencode] = useState(false)
  const [outputPath, setOutputPath] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<TrimProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!target) return
    setOutputPath(defaultOutputName(target.path))
    setError(null)
    setProgress(null)
    setJobId(null)
    setStartSec(0)
    setEndSec(0)
    setStartInput('00:00.0')
    setEndInput('00:00.0')
  }, [target])

  useEffect(() => {
    if (jobId == null) return
    const offP = window.api.onTrimProgress((p) => {
      if (p.jobId === jobId) setProgress(p)
    })
    const offD = window.api.onTrimDone((info) => {
      if (info.jobId === jobId) {
        setProgress((prev) => (prev ? { ...prev, percent: 100 } : null))
        setTimeout(() => {
          onDone()
          onClose()
        }, 500)
      }
    })
    const offE = window.api.onTrimError((info) => {
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

  const onLoadedMeta = (): void => {
    const v = videoRef.current
    if (!v) return
    const d = v.duration
    setDuration(d)
    setEndSec(d)
    setEndInput(fmtTime(d))
  }

  const onTimeUpdate = (): void => {
    const v = videoRef.current
    if (v) setCurrentTime(v.currentTime)
  }

  const setStart = (sec: number): void => {
    const s = Math.max(0, Math.min(sec, duration))
    setStartSec(s)
    setStartInput(fmtTime(s))
    if (s >= endSec) {
      setEndSec(Math.min(duration, s + 1))
      setEndInput(fmtTime(Math.min(duration, s + 1)))
    }
  }

  const setEnd = (sec: number): void => {
    const s = Math.max(0, Math.min(sec, duration))
    setEndSec(s)
    setEndInput(fmtTime(s))
    if (s <= startSec) {
      setStartSec(Math.max(0, s - 1))
      setStartInput(fmtTime(Math.max(0, s - 1)))
    }
  }

  const playRange = (): void => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = startSec
    void v.play()
    const onTime = (): void => {
      if (v.currentTime >= endSec) {
        v.pause()
        v.removeEventListener('timeupdate', onTime)
      }
    }
    v.addEventListener('timeupdate', onTime)
  }

  const start = async (): Promise<void> => {
    if (endSec <= startSec) {
      setError('結束時間必須大於開始時間')
      return
    }
    setError(null)
    setProgress(null)
    const res = await window.api.trimStart({
      inputMp4: target.path,
      inputSrt: target.srtPath,
      outputMp4: outputPath,
      outputSrt: target.srtPath ? outputPath.replace(/\.mp4$/i, '.srt') : null,
      startSec,
      endSec,
      reencode
    })
    setJobId(res.jobId)
  }

  const cancel = (): void => {
    if (jobId) {
      window.api.trimCancel(jobId)
      setJobId(null)
      setProgress(null)
    }
  }

  const running = jobId !== null
  const pct = progress?.percent ?? 0
  const trimDuration = Math.max(0, endSec - startSec)

  return (
    <div className="modal-backdrop" onClick={running ? undefined : onClose}>
      <div className="modal trim-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>剪輯 — {target.name}</div>
          <button className="btn-small" disabled={running} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <video
            ref={videoRef}
            src={pathToFileUrl(target.path)}
            controls
            onLoadedMetadata={onLoadedMeta}
            onTimeUpdate={onTimeUpdate}
            className="trim-video"
          />

          <div className="trim-timeline">
            <div className="trim-track">
              <div
                className="trim-range"
                style={{
                  left: duration > 0 ? `${(startSec / duration) * 100}%` : '0%',
                  width: duration > 0 ? `${((endSec - startSec) / duration) * 100}%` : '0%'
                }}
              />
              <div
                className="trim-playhead"
                style={{ left: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
              />
            </div>
            <div className="trim-times">
              <span>{fmtTime(currentTime)}</span>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>

          <div className="opt-row">
            <button className="btn-small" onClick={() => setStart(currentTime)} disabled={running}>
              ⏮ 設為起點
            </button>
            <label>
              起點
              <input
                type="text"
                className="opt-text opt-num"
                style={{ width: 100 }}
                value={startInput}
                disabled={running}
                onChange={(e) => setStartInput(e.target.value)}
                onBlur={() => {
                  const v = parseTime(startInput)
                  if (v != null) setStart(v)
                  else setStartInput(fmtTime(startSec))
                }}
              />
            </label>
            <label>
              終點
              <input
                type="text"
                className="opt-text opt-num"
                style={{ width: 100 }}
                value={endInput}
                disabled={running}
                onChange={(e) => setEndInput(e.target.value)}
                onBlur={() => {
                  const v = parseTime(endInput)
                  if (v != null) setEnd(v)
                  else setEndInput(fmtTime(endSec))
                }}
              />
            </label>
            <button className="btn-small" onClick={() => setEnd(currentTime)} disabled={running}>
              ⏭ 設為終點
            </button>
            <button className="btn-small" onClick={playRange} disabled={running || trimDuration <= 0}>
              ▶ 預覽範圍
            </button>
            <div style={{ flex: 1 }} />
            <span className="opt-hint">剪後長度：{fmtTime(trimDuration)}</span>
          </div>

          <div className="opt-row">
            <label style={{ flex: 1 }}>
              輸出檔名
              <input
                type="text"
                className="opt-text"
                value={outputPath}
                disabled={running}
                onChange={(e) => setOutputPath(e.target.value)}
              />
            </label>
          </div>

          <div className="opt-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={reencode}
                disabled={running}
                onChange={(e) => setReencode(e.target.checked)}
              />
              精確剪切（重新編碼，較慢但畫格精確）
            </label>
            <span className="opt-hint">
              預設為 stream copy 模式，切點對齊到最近的 keyframe，速度快幾乎不耗時。
            </span>
          </div>

          {(running || progress) && (
            <div className="opt-row">
              <div className="download-progress" style={{ flex: 1 }}>
                <div className="download-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="opt-hint">{pct.toFixed(1)}%</span>
            </div>
          )}

          {error && <div className="warn">錯誤：{error}</div>}
        </div>
        <div className="modal-footer">
          {!running ? (
            <>
              <div style={{ flex: 1 }} />
              <button className="btn-small" onClick={onClose}>
                取消
              </button>
              <button className="btn btn-record" onClick={start} disabled={trimDuration <= 0}>
                開始剪輯
              </button>
            </>
          ) : (
            <>
              <div style={{ flex: 1 }} />
              <button className="btn btn-stop" onClick={cancel}>
                取消剪輯
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
