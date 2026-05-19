import { useEffect, useRef, useState } from 'react'

interface Props {
  analyser: AnalyserNode | null
}

export function VuMeter({ analyser }: Props): React.JSX.Element {
  const [level, setLevel] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!analyser) {
      setLevel(0)
      return
    }
    const buf = new Float32Array(analyser.fftSize)
    const tick = (): void => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      setLevel(Math.min(1, rms * 1.5))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [analyser])

  const pct = Math.round(level * 100)
  const color = level > 0.9 ? '#ef4444' : level > 0.6 ? '#f59e0b' : '#22c55e'
  return (
    <div className="vu-meter">
      <div className="vu-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
