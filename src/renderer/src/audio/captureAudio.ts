import pcmCaptureWorkletUrl from './pcm-capture.worklet.js?url&no-inline'

export interface AudioCapture {
  kind: 'system' | 'mic'
  stream: MediaStream
  context: AudioContext
  gain: GainNode
  analyser: AnalyserNode
  processor: AudioWorkletNode
  channels: number
  sampleRate: number
  setVolume: (v: number) => void
  stop: () => void
}

// Audio per chunk sent to the main process. The old 4096-frame chunks arrived
// as 85ms lumps; small chunks keep the audio stream flowing evenly.
const CHUNK_SECONDS = 0.02

async function getMicStream(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false
    },
    video: false
  })
}

async function getSystemStream(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    // Capture system sound as-is. Chromium otherwise applies voice-call
    // processing (echo cancellation, noise suppression, auto gain) meant for
    // microphones, which muddies music and video audio.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
  })
  stream.getVideoTracks().forEach((t) => {
    t.stop()
    stream.removeTrack(t)
  })
  if (stream.getAudioTracks().length === 0) {
    throw new Error('系統音 loopback 不可用（請確認 Windows 並有播放中的音訊應用程式）')
  }
  return stream
}

export async function startAudioCapture(
  kind: 'system' | 'mic',
  opts: { deviceId?: string; sampleRate?: number; volume: number; onChunk: (data: ArrayBuffer) => void }
): Promise<AudioCapture> {
  const stream = kind === 'system' ? await getSystemStream() : await getMicStream(opts.deviceId)
  const context = new AudioContext({ sampleRate: opts.sampleRate ?? 48000 })
  const source = context.createMediaStreamSource(stream)
  const channels = Math.min(source.channelCount, 2)

  const gain = context.createGain()
  gain.gain.value = opts.volume
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024

  // Capture on the audio thread; see pcm-capture.worklet.js for why.
  await context.audioWorklet.addModule(pcmCaptureWorkletUrl)
  const processor = new AudioWorkletNode(context, 'pcm-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [channels],
    channelCount: channels,
    channelCountMode: 'explicit',
    processorOptions: { channels, chunkFrames: Math.round(context.sampleRate * CHUNK_SECONDS) }
  })
  processor.port.onmessage = (ev: MessageEvent<ArrayBuffer>): void => {
    opts.onChunk(ev.data)
  }

  const muteSink = context.createGain()
  muteSink.gain.value = 0

  source.connect(gain)
  gain.connect(analyser)
  analyser.connect(processor)
  processor.connect(muteSink)
  muteSink.connect(context.destination)

  // Keep the output from being pure digital silence. After ~30s of an
  // all-zero output Chromium swaps the sound card for a timer-driven fake
  // output; once the window is minimised or hidden to the tray those timers
  // are throttled and the graph renders only ~65% of real time, so a third of
  // the audio is never captured and the recording crackles. 1e-6 is far below
  // one 16-bit step: inaudible, and it rounds to zero if it is ever captured.
  const keepAlive = context.createConstantSource()
  keepAlive.offset.value = 1e-6
  keepAlive.connect(context.destination)
  keepAlive.start()

  if (context.state === 'suspended') {
    try {
      await context.resume()
    } catch (e) {
      console.warn('AudioContext.resume failed', e)
    }
  }

  return {
    kind,
    stream,
    context,
    gain,
    analyser,
    processor,
    channels,
    sampleRate: context.sampleRate,
    setVolume: (v): void => {
      gain.gain.value = v
    },
    stop: (): void => {
      processor.port.onmessage = null
      try {
        source.disconnect()
        gain.disconnect()
        analyser.disconnect()
        processor.disconnect()
        muteSink.disconnect()
        keepAlive.stop()
        keepAlive.disconnect()
      } catch {
        // ignore
      }
      stream.getTracks().forEach((t) => t.stop())
      void context.close()
    }
  }
}

export function readLevel(analyser: AnalyserNode): number {
  const buf = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  const rms = Math.sqrt(sum / buf.length)
  return Math.min(1, rms * 1.5)
}
