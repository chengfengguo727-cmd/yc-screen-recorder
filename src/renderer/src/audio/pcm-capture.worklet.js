/* eslint-disable @typescript-eslint/explicit-function-return-type -- Vite ships worklet modules untranspiled, so this file is plain JS */
// Runs on the audio rendering thread, not the renderer's main thread.
//
// The previous ScriptProcessorNode delivered samples through main-thread
// callbacks; whenever the page was busy those callbacks were skipped and the
// samples were lost for good (one 7-minute recording came out 22.5s short),
// which also pushed the audio progressively out of sync with the video.
// Messages posted from here queue up instead of dropping when the main thread
// is late. Chunks are small (20ms) so audio arrives smoothly, not in lumps.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = options.processorOptions || {}
    this.channels = opts.channels || 2
    this.chunkFrames = opts.chunkFrames || 960
    this.buf = new Int16Array(this.chunkFrames * this.channels)
    this.fill = 0
  }

  process(inputs) {
    const input = inputs[0] || []
    // A silent or disconnected source can hand us zero channels; keep the
    // sample clock running with silence so the audio timeline never shrinks.
    const frames = input.length > 0 ? input[0].length : 128
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < this.channels; c++) {
        const ch = input[c] || input[0]
        let s = ch ? ch[i] : 0
        s = s < -1 ? -1 : s > 1 ? 1 : s
        this.buf[this.fill++] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      if (this.fill === this.buf.length) {
        this.port.postMessage(this.buf.buffer, [this.buf.buffer])
        this.buf = new Int16Array(this.chunkFrames * this.channels)
        this.fill = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)
