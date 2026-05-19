export interface AudioCapture {
  kind: 'system' | 'mic'
  stream: MediaStream
  context: AudioContext
  gain: GainNode
  analyser: AnalyserNode
  processor: ScriptProcessorNode
  channels: number
  sampleRate: number
  setVolume: (v: number) => void
  stop: () => void
}

function float32ToInt16(buffer: Float32Array): Int16Array {
  const out = new Int16Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function interleave(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const length = channels[0].length
  const out = new Float32Array(length * channels.length)
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels.length; c++) {
      out[i * channels.length + c] = channels[c][i]
    }
  }
  return out
}

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
    audio: true
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

  const bufferSize = 4096
  const processor = context.createScriptProcessor(bufferSize, channels, channels)
  processor.onaudioprocess = (ev): void => {
    const chs: Float32Array[] = []
    for (let c = 0; c < channels; c++) chs.push(ev.inputBuffer.getChannelData(c).slice())
    const interleaved = interleave(chs)
    const pcm = float32ToInt16(interleaved)
    opts.onChunk(pcm.buffer as ArrayBuffer)
  }

  const muteSink = context.createGain()
  muteSink.gain.value = 0

  source.connect(gain)
  gain.connect(analyser)
  analyser.connect(processor)
  processor.connect(muteSink)
  muteSink.connect(context.destination)

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
      processor.onaudioprocess = null
      try {
        source.disconnect()
        gain.disconnect()
        analyser.disconnect()
        processor.disconnect()
        muteSink.disconnect()
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
