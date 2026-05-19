import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from './store'
import { SourcePicker } from './components/SourcePicker'
import { OptionsBar } from './components/OptionsBar'
import { RecordControls } from './components/RecordControls'
import { RecordingsList } from './components/RecordingsList'
import { LogPanel } from './components/LogPanel'
import { AudioMixer } from './components/AudioMixer'
import { WebcamPanel } from './components/WebcamPanel'
import { TranscriptPanel } from './components/TranscriptPanel'
import { OptionsModal } from './components/OptionsModal'
import { RegionPicker } from './components/RegionPicker'
import { NextScheduleBadge } from './components/NextScheduleBadge'
import { HelpModal } from './components/HelpModal'
import { ClickOverlay } from './components/ClickOverlay'

function App(): React.JSX.Element {
  const hash = window.location.hash
  if (hash.startsWith('#region-picker')) return <RegionPicker />
  if (hash.startsWith('#click-overlay')) return <ClickOverlay />
  return <MainApp />
}

function MainApp(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    refresh,
    reloadPreferences,
    setSession,
    appendLog,
    refreshRecordings,
    appendTranscript,
    setModelDownload,
    refreshWhisperModels
  } = useAppStore()

  useEffect(() => {
    void (async (): Promise<void> => {
      await reloadPreferences()
      await refresh()
    })()
    const offState = window.api.onState((s) => setSession(s))
    const offLog = window.api.onLog((l) => appendLog(l))
    const offFin = window.api.onFinished(() => void refreshRecordings())
    const offSplit = window.api.onAutoSplit((info) => {
      appendLog(`[auto-split] continued recording to ${info.next}`)
      void refreshRecordings()
    })
    const offSeg = window.api.onTranscriptSegment((s) => appendTranscript(s))
    const offWP = window.api.onWhisperProgress((p) =>
      setModelDownload({ modelKey: p.modelKey, received: p.received, total: p.total })
    )
    const offWD = window.api.onWhisperDone(() => {
      setModelDownload(null)
      void refreshWhisperModels()
    })
    return () => {
      offState()
      offLog()
      offFin()
      offSplit()
      offSeg()
      offWP()
      offWD()
    }
  }, [
    refresh,
    reloadPreferences,
    setSession,
    appendLog,
    refreshRecordings,
    appendTranscript,
    setModelDownload,
    refreshWhisperModels
  ])

  const [optionsOpen, setOptionsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          YC Screen Recorder <span className="version-tag">v{__APP_VERSION__}</span>
        </div>
        <NextScheduleBadge />
        <RecordControls />
        <button className="btn-small" onClick={() => setHelpOpen(true)} title={t('header.titleHelp')}>
          ?
        </button>
        <button className="btn-small" onClick={() => setOptionsOpen(true)} title={t('header.titleOptions')}>
          ⚙
        </button>
      </header>
      <OptionsModal open={optionsOpen} onClose={() => setOptionsOpen(false)} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <main className="app-body">
        <section className="left-col">
          <SourcePicker />
          <AudioMixer />
          <OptionsBar />
        </section>
        <section className="right-col">
          <WebcamPanel />
          <TranscriptPanel />
          <RecordingsList />
        </section>
      </main>
      <LogPanel />
    </div>
  )
}

export default App
