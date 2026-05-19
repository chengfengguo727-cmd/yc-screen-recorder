import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface ClickRipple {
  id: number
  x: number
  y: number
  button: number
  bornAt: number
}

interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

function parseBounds(): Bounds {
  const hash = window.location.hash
  const get = (k: string): number => {
    const m = new RegExp(`${k}=(-?\\d+)`).exec(hash)
    return m ? Number(m[1]) : 0
  }
  return { x: get('x'), y: get('y'), w: get('w'), h: get('h') }
}

const ANIMATION_MS = 600

export function ClickOverlay(): React.JSX.Element {
  const bounds = useRef<Bounds>(parseBounds())
  const [ripples, setRipples] = useState<ClickRipple[]>([])
  const nextId = useRef(0)

  // The main app's body CSS sets a dark background — we need the body and
  // html elements to be transparent so the BrowserWindow's transparency
  // actually shows through. Without this the overlay paints opaque black
  // over the whole screen.
  useLayoutEffect(() => {
    const prevHtml = document.documentElement.style.background
    const prevBody = document.body.style.background
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    return () => {
      document.documentElement.style.background = prevHtml
      document.body.style.background = prevBody
    }
  }, [])

  useEffect(() => {
    const handler = (info: { x: number; y: number; button: number }): void => {
      const b = bounds.current
      // Filter: only render ripples that fall within this overlay's display bounds.
      // uiohook gives virtual-desktop (global) coordinates.
      if (
        info.x < b.x ||
        info.x >= b.x + b.w ||
        info.y < b.y ||
        info.y >= b.y + b.h
      ) {
        return
      }
      const localX = info.x - b.x
      const localY = info.y - b.y
      const id = nextId.current++
      setRipples((prev) => [
        ...prev,
        { id, x: localX, y: localY, button: info.button, bornAt: performance.now() }
      ])
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id))
      }, ANIMATION_MS + 100)
    }
    const off = window.api.onClickOverlayClick(handler)
    return off
  }, [])

  return (
    <div className="click-overlay-root">
      {ripples.map((r) => (
        <div
          key={r.id}
          className={`click-ripple click-ripple-btn-${r.button}`}
          style={{ left: r.x, top: r.y }}
        />
      ))}
    </div>
  )
}
