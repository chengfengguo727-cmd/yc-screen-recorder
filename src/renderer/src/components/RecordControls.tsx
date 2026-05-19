import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { audioManager } from '../audio/manager'
import type { AudioTrackConfig, TranscriptArgs, WebcamArgs } from '../../../preload'

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

async function doScreenshot(displayId: number | null, refreshRecordings: () => Promise<void>): Promise<void> {
  if (displayId == null) return
  try {
    await window.api.screenshot(displayId)
    await refreshRecordings()
  } catch (e) {
    console.error('screenshot failed', e)
  }
}

export function RecordControls(): React.JSX.Element {
  const {
    session,
    mode,
    selectedDisplayId,
    framerate,
    drawMouse,
    encoder,
    bitrate,
    refreshRecordings,
    systemEnabled,
    micEnabled,
    selectedMicId,
    systemVolume,
    micVolume,
    webcamEnabled,
    selectedWebcamName,
    webcamPosition,
    webcamWidthRatio,
    webcamFramerate,
    sttEnabled,
    selectedWhisperKey,
    whisperLanguage,
    whisperQueueSeconds,
    region,
    encoderQuality,
    clearTranscript
  } = useAppStore()
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (session.status === 'recording' || session.status === 'paused') {
      const id = setInterval(() => setTick((x) => x + 1), 250)
      return () => clearInterval(id)
    }
    return undefined
  }, [session.status])

  const isActive =
    session.status === 'recording' ||
    session.status === 'starting' ||
    session.status === 'stopping' ||
    session.status === 'paused' ||
    session.status === 'finalizing'
  const accumulated = session.accumulatedMs ?? 0
  const duration =
    session.status === 'recording' && session.startedAt
      ? accumulated + (Date.now() - session.startedAt)
      : session.status === 'paused'
        ? accumulated
        : session.durationMs ?? 0

  const onStart = async (): Promise<void> => {
    if (mode === 'display' && selectedDisplayId == null) {
      alert('請先選擇要錄製的螢幕')
      return
    }
    if (mode === 'region' && !region) {
      alert('請先選取錄影範圍')
      return
    }
    setBusy(true)
    audioManager.stopAll()
    const audioConfig: AudioTrackConfig[] = []
    try {
      if (systemEnabled) {
        const info = await audioManager.startCapture('system', { volume: systemVolume })
        audioConfig.push({
          kind: 'system',
          channels: info.channels,
          sampleRate: info.sampleRate,
          volume: systemVolume
        })
      }
      if (micEnabled) {
        const info = await audioManager.startCapture('mic', {
          deviceId: selectedMicId ?? undefined,
          volume: micVolume
        })
        audioConfig.push({
          kind: 'mic',
          channels: info.channels,
          sampleRate: info.sampleRate,
          volume: micVolume
        })
      }
      const webcamArg: WebcamArgs | null =
        webcamEnabled && selectedWebcamName
          ? {
              deviceName: selectedWebcamName,
              position: webcamPosition,
              widthRatio: webcamWidthRatio,
              framerate: webcamFramerate
            }
          : null
      const transcriptArg: TranscriptArgs | null =
        sttEnabled && (micEnabled || systemEnabled) && selectedWhisperKey
          ? {
              modelKey: selectedWhisperKey,
              language: whisperLanguage,
              queueSeconds: whisperQueueSeconds
            }
          : null
      clearTranscript()
      await window.api.start({
        mode,
        displayId: selectedDisplayId ?? undefined,
        region: mode === 'region' && region ? region : undefined,
        framerate,
        drawMouse,
        encoder: encoder ?? undefined,
        encoderQuality,
        bitrate,
        audio: audioConfig,
        webcam: webcamArg,
        transcript: transcriptArg
      })
    } catch (e) {
      audioManager.stopAll()
      alert(`開始錄影失敗：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const onStop = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.stop()
      audioManager.stopAll()
      await refreshRecordings()
    } finally {
      setBusy(false)
    }
  }

  const onPause = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.pause()
    } finally {
      setBusy(false)
    }
  }

  const onResume = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.resume()
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const off = window.api.onHotkey((action) => {
      if (action === 'toggle-record') {
        if (isActive) void onStop()
        else void onStart()
      } else if (action === 'screenshot') {
        void doScreenshot(selectedDisplayId, refreshRecordings)
      }
    })
    return off
  })

  useEffect(() => {
    const off = window.api.onAutoStartRecord(() => {
      if (isActive) {
        useAppStore.getState().appendLog('[auto-start] skipped — already recording')
        return
      }
      useAppStore.getState().appendLog('[auto-start] triggered on app launch')
      void onStart()
    })
    return off
  })

  useEffect(() => {
    const off = window.api.onScheduleFire(async (info) => {
      if (isActive) {
        useAppStore.getState().appendLog(
          `[schedule] skipped firing "${info.name}" — already recording`
        )
        return
      }
      useAppStore.getState().appendLog(
        `[schedule] firing "${info.name}" for ${info.durationMinutes} min`
      )
      try {
        await onStart()
        setTimeout(
          () => {
            useAppStore.getState().appendLog(`[schedule] auto-stop after ${info.durationMinutes} min`)
            void onStop()
          },
          info.durationMinutes * 60_000
        )
      } catch (e) {
        useAppStore.getState().appendLog(`[schedule] start failed: ${(e as Error).message}`)
      }
    })
    return off
  })

  const partTag = session.partCount && session.partCount > 1 ? ` (Part ${session.partCount})` : ''
  const statusText =
    session.status === 'recording'
      ? `錄影中 ${formatDuration(duration)}${partTag}`
      : session.status === 'paused'
        ? `已暫停 ${formatDuration(duration)}${partTag}`
        : session.status === 'starting'
          ? '啟動中…'
          : session.status === 'stopping'
            ? '停止中…'
            : session.status === 'finalizing'
              ? '合併檔案中…'
              : session.status === 'error'
                ? `錯誤：${session.error ?? '未知'}`
                : '待機'

  return (
    <div className="record-bar">
      <div className={`status-dot ${session.status}`} />
      <div className="status-text">{statusText}</div>
      <button
        className="btn btn-snap"
        disabled={isActive || selectedDisplayId == null}
        onClick={() => doScreenshot(selectedDisplayId, refreshRecordings)}
        title="截圖 (Ctrl+Shift+S)"
      >
        📷
      </button>
      {!isActive && (
        <button className="btn btn-record" disabled={busy} onClick={onStart} title="開始錄影 (Ctrl+Shift+R)">
          ● 開始錄影
        </button>
      )}
      {session.status === 'recording' && (
        <button className="btn btn-pause" disabled={busy} onClick={onPause} title="暫停">
          ⏸ 暫停
        </button>
      )}
      {session.status === 'paused' && (
        <button className="btn btn-record" disabled={busy} onClick={onResume} title="續錄">
          ▶ 續錄
        </button>
      )}
      {isActive && (
        <button
          className="btn btn-stop"
          disabled={busy || (session.status !== 'recording' && session.status !== 'paused')}
          onClick={onStop}
          title="停止 (Ctrl+Shift+R)"
        >
          ■ 停止
        </button>
      )}
    </div>
  )
}
