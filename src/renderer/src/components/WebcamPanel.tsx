import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import type { PipPosition } from '../../../preload'

const POSITIONS: { value: PipPosition; label: string }[] = [
  { value: 'tl', label: '左上' },
  { value: 'tr', label: '右上' },
  { value: 'bl', label: '左下' },
  { value: 'br', label: '右下' }
]

export function WebcamPanel(): React.JSX.Element {
  const {
    webcamDevices,
    selectedWebcamName,
    webcamEnabled,
    webcamPosition,
    webcamWidthRatio,
    webcamFramerate,
    refreshWebcams,
    setWebcamEnabled,
    setSelectedWebcamName,
    setWebcamPosition,
    setWebcamWidthRatio,
    setWebcamFramerate,
    session
  } = useAppStore()

  const isRecording = session.status === 'recording' || session.status === 'starting'
  const videoRef = useRef<HTMLVideoElement>(null)
  const [previewing, setPreviewing] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    void refreshWebcams()
  }, [refreshWebcams])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const startPreview = async (): Promise<void> => {
    if (!selectedWebcamName) return
    try {
      // Request permission first so enumerateDevices returns labels
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      probe.getTracks().forEach((t) => t.stop())

      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevs = devices.filter((d) => d.kind === 'videoinput')
      const norm = (s: string): string => s.trim().toLowerCase()
      const target = norm(selectedWebcamName)
      const match =
        videoDevs.find((d) => norm(d.label) === target) ??
        videoDevs.find((d) => norm(d.label).includes(target)) ??
        videoDevs.find((d) => target.includes(norm(d.label)))
      if (!match) {
        alert(
          `找不到符合 dshow 名稱「${selectedWebcamName}」的 Chromium 鏡頭。\n` +
            `Chromium 看到的鏡頭：${videoDevs.map((d) => d.label).join(', ') || '(無)'}`
        )
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: match.deviceId }, width: 640, height: 480 },
        audio: false
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setPreviewing(true)
    } catch (e) {
      alert(`預覽失敗：${(e as Error).message}`)
    }
  }

  const stopPreview = (): void => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setPreviewing(false)
  }

  return (
    <div className="panel">
      <div className="panel-title">
        Webcam (PiP)
        <button className="btn-small" onClick={() => refreshWebcams()}>↻</button>
      </div>
      <div className="webcam-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={webcamEnabled}
            disabled={isRecording}
            onChange={(e) => setWebcamEnabled(e.target.checked)}
          />
          啟用
        </label>
        <select
          value={selectedWebcamName ?? ''}
          disabled={isRecording}
          onChange={(e) => setSelectedWebcamName(e.target.value || null)}
        >
          {webcamDevices.length === 0 && <option value="">（找不到 dshow 視訊裝置）</option>}
          {webcamDevices.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div className="webcam-row">
        <label>
          位置
          <select
            value={webcamPosition}
            disabled={isRecording}
            onChange={(e) => setWebcamPosition(e.target.value as PipPosition)}
          >
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          大小 {Math.round(webcamWidthRatio * 100)}%
          <input
            type="range"
            min={0.1}
            max={0.4}
            step={0.01}
            value={webcamWidthRatio}
            disabled={isRecording}
            onChange={(e) => setWebcamWidthRatio(Number(e.target.value))}
          />
        </label>
        <label>
          FPS
          <select
            value={webcamFramerate}
            disabled={isRecording}
            onChange={(e) => setWebcamFramerate(Number(e.target.value))}
          >
            <option value={15}>15</option>
            <option value={24}>24</option>
            <option value={30}>30</option>
          </select>
        </label>
      </div>
      <div className="webcam-preview">
        {previewing ? (
          <>
            <video ref={videoRef} autoPlay muted />
            <button className="btn-small" onClick={stopPreview}>
              關閉預覽
            </button>
          </>
        ) : (
          <button className="btn-small" disabled={!selectedWebcamName} onClick={startPreview}>
            預覽鏡頭
          </button>
        )}
      </div>
    </div>
  )
}
