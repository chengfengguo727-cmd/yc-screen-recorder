import { AudioCapture, startAudioCapture } from './captureAudio'

class AudioManager {
  private captures: Map<'system' | 'mic', AudioCapture> = new Map()

  getAnalyser(kind: 'system' | 'mic'): AnalyserNode | null {
    return this.captures.get(kind)?.analyser ?? null
  }

  async startCapture(
    kind: 'system' | 'mic',
    opts: { deviceId?: string; volume: number }
  ): Promise<{ channels: number; sampleRate: number }> {
    if (this.captures.has(kind)) {
      throw new Error(`${kind} already capturing`)
    }
    const cap = await startAudioCapture(kind, {
      deviceId: opts.deviceId,
      volume: opts.volume,
      onChunk: (data) => window.api.audioChunk(kind, data)
    })
    this.captures.set(kind, cap)
    return { channels: cap.channels, sampleRate: cap.sampleRate }
  }

  setVolume(kind: 'system' | 'mic', volume: number): void {
    this.captures.get(kind)?.setVolume(volume)
  }

  stopCapture(kind: 'system' | 'mic'): void {
    const cap = this.captures.get(kind)
    if (cap) {
      cap.stop()
      this.captures.delete(kind)
    }
  }

  stopAll(): void {
    for (const cap of this.captures.values()) cap.stop()
    this.captures.clear()
  }

  isActive(kind: 'system' | 'mic'): boolean {
    return this.captures.has(kind)
  }
}

export const audioManager = new AudioManager()
