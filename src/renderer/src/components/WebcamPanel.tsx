import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'
import type { PipPosition } from '../../../preload'

export function WebcamPanel(): React.JSX.Element {
  const { t } = useTranslation()
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

  const positions: { value: PipPosition; label: string }[] = [
    { value: 'tl', label: t('webcam.posTL') },
    { value: 'tr', label: t('webcam.posTR') },
    { value: 'bl', label: t('webcam.posBL') },
    { value: 'br', label: t('webcam.posBR') }
  ]

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
          t('webcam.notFound', {
            name: selectedWebcamName,
            labels: videoDevs.map((d) => d.label).join(', ') || `(${t('common.none')})`
          })
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
      alert(t('webcam.previewFailed', { message: (e as Error).message }))
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
        {t('webcam.title')}
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
          {t('webcam.enable')}
        </label>
        <select
          value={selectedWebcamName ?? ''}
          disabled={isRecording}
          onChange={(e) => setSelectedWebcamName(e.target.value || null)}
        >
          {webcamDevices.length === 0 && <option value="">{t('webcam.noDevice')}</option>}
          {webcamDevices.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div className="webcam-row">
        <label>
          {t('webcam.position')}
          <select
            value={webcamPosition}
            disabled={isRecording}
            onChange={(e) => setWebcamPosition(e.target.value as PipPosition)}
          >
            {positions.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('webcam.size')} {Math.round(webcamWidthRatio * 100)}%
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
          {t('webcam.fps')}
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
              {t('webcam.closePreview')}
            </button>
          </>
        ) : (
          <button className="btn-small" disabled={!selectedWebcamName} onClick={startPreview}>
            {t('webcam.preview')}
          </button>
        )}
      </div>
    </div>
  )
}
