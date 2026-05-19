import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { audioManager } from '../audio/manager'
import { VuMeter } from './VuMeter'

export function AudioMixer(): React.JSX.Element {
  const {
    micDevices,
    selectedMicId,
    setSelectedMicId,
    refreshMicDevices,
    micEnabled,
    systemEnabled,
    setMicEnabled,
    setSystemEnabled,
    micVolume,
    systemVolume,
    setMicVolume,
    setSystemVolume,
    session
  } = useAppStore()

  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null)
  const [systemAnalyser, setSystemAnalyser] = useState<AnalyserNode | null>(null)
  const [testing, setTesting] = useState<'mic' | 'system' | null>(null)
  const isRecording = session.status === 'recording' || session.status === 'starting'

  useEffect(() => {
    void refreshMicDevices()
  }, [refreshMicDevices])

  const startTest = async (kind: 'system' | 'mic'): Promise<void> => {
    setTesting(kind)
    try {
      await audioManager.startCapture(kind, {
        deviceId: kind === 'mic' ? selectedMicId ?? undefined : undefined,
        volume: kind === 'mic' ? micVolume : systemVolume
      })
      const analyser = audioManager.getAnalyser(kind)
      if (kind === 'mic') setMicAnalyser(analyser)
      else setSystemAnalyser(analyser)
    } catch (e) {
      alert(`測試 ${kind} 失敗：${(e as Error).message}`)
      setTesting(null)
    }
  }

  const stopTest = (kind: 'system' | 'mic'): void => {
    audioManager.stopCapture(kind)
    if (kind === 'mic') setMicAnalyser(null)
    else setSystemAnalyser(null)
    setTesting(null)
  }

  useEffect(() => {
    if (isRecording) {
      setMicAnalyser(audioManager.getAnalyser('mic'))
      setSystemAnalyser(audioManager.getAnalyser('system'))
    } else if (!testing) {
      setMicAnalyser(null)
      setSystemAnalyser(null)
    }
  }, [isRecording, testing])

  return (
    <div className="panel">
      <div className="panel-title">音訊</div>

      <div className="audio-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={systemEnabled}
            disabled={isRecording}
            onChange={(e) => setSystemEnabled(e.target.checked)}
          />
          系統音 (loopback)
        </label>
        <div className="audio-controls">
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={systemVolume}
            onChange={(e) => {
              const v = Number(e.target.value)
              setSystemVolume(v)
              audioManager.setVolume('system', v)
            }}
          />
          <span className="volume-label">{systemVolume.toFixed(2)}×</span>
          {!isRecording &&
            (testing === 'system' ? (
              <button className="btn-small" onClick={() => stopTest('system')}>
                停止測試
              </button>
            ) : (
              <button className="btn-small" disabled={!systemEnabled} onClick={() => startTest('system')}>
                測試
              </button>
            ))}
        </div>
        <VuMeter analyser={systemAnalyser} />
      </div>

      <div className="audio-row">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={micEnabled}
            disabled={isRecording}
            onChange={(e) => setMicEnabled(e.target.checked)}
          />
          麥克風
        </label>
        <select
          value={selectedMicId ?? ''}
          disabled={isRecording}
          onChange={(e) => setSelectedMicId(e.target.value || null)}
        >
          {micDevices.length === 0 && <option value="">（未取得權限）</option>}
          {micDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
        <div className="audio-controls">
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={micVolume}
            onChange={(e) => {
              const v = Number(e.target.value)
              setMicVolume(v)
              audioManager.setVolume('mic', v)
            }}
          />
          <span className="volume-label">{micVolume.toFixed(2)}×</span>
          {!isRecording &&
            (testing === 'mic' ? (
              <button className="btn-small" onClick={() => stopTest('mic')}>
                停止測試
              </button>
            ) : (
              <button className="btn-small" disabled={!micEnabled} onClick={() => startTest('mic')}>
                測試
              </button>
            ))}
        </div>
        <VuMeter analyser={micAnalyser} />
      </div>
    </div>
  )
}
