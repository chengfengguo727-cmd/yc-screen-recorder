import { useEffect, useRef, useState } from 'react'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function getDisplayIdFromHash(): number {
  const hash = window.location.hash
  const m = /displayId=(-?\d+)/.exec(hash)
  return m ? Number(m[1]) : 0
}

export function RegionPicker(): React.JSX.Element {
  const displayId = useRef<number>(getDisplayIdFromHash())
  const [bg, setBg] = useState<string | null>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [mouseDown, setMouseDown] = useState(false)

  useEffect(() => {
    void window.api.getRegionPickerBg(displayId.current).then((dataUrl) => {
      if (dataUrl) setBg(dataUrl)
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        window.api.cancelRegionPick()
      } else if (e.key === 'Enter' && rect && rect.w > 4 && rect.h > 4) {
        window.api.submitRegionPick({
          displayId: displayId.current,
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rect])

  const onMouseDown = (e: React.MouseEvent): void => {
    setStart({ x: e.clientX, y: e.clientY })
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
    setMouseDown(true)
  }

  const onMouseMove = (e: React.MouseEvent): void => {
    if (!mouseDown || !start) return
    const x = Math.min(start.x, e.clientX)
    const y = Math.min(start.y, e.clientY)
    const w = Math.abs(e.clientX - start.x)
    const h = Math.abs(e.clientY - start.y)
    setRect({ x, y, w, h })
  }

  const onMouseUp = (e: React.MouseEvent): void => {
    if (!mouseDown || !start) return
    setMouseDown(false)
    const x = Math.min(start.x, e.clientX)
    const y = Math.min(start.y, e.clientY)
    const w = Math.abs(e.clientX - start.x)
    const h = Math.abs(e.clientY - start.y)
    if (w > 4 && h > 4) {
      window.api.submitRegionPick({ displayId: displayId.current, x, y, w, h })
    } else {
      setRect(null)
    }
  }

  return (
    <div
      className="region-picker"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {bg && <img className="region-picker-bg" src={bg} alt="" draggable={false} />}
      {!rect && <div className="region-dim-full" />}
      <div className="region-hint">
        拖曳選取錄影範圍 · Esc 取消{rect && rect.w > 4 ? ' · Enter 確認' : ''}
      </div>
      {rect && (
        <div
          className="region-rect region-rect-cutout"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h
          }}
        >
          <div className="region-label">
            {rect.w} × {rect.h}
          </div>
        </div>
      )}
    </div>
  )
}
