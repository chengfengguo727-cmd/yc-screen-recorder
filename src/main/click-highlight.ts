import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
// uiohook-napi is a native module with N-API prebuilds — loaded lazily so a
// missing/incompatible binary doesn't crash the whole app at startup.

interface UioStub {
  start: () => void
  stop: () => void
  on: (event: 'mousedown', listener: (e: { x: number; y: number; button: number }) => void) => void
  off: (event: 'mousedown', listener: (e: { x: number; y: number; button: number }) => void) => void
}

let uio: UioStub | null = null
let uioLoaded = false
let listenerActive = false
let overlays: BrowserWindow[] = []
let mouseHandler: ((e: { x: number; y: number; button: number }) => void) | null = null

function loadUio(): UioStub | null {
  if (uioLoaded) return uio
  uioLoaded = true
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('uiohook-napi')
    uio = mod.uIOhook ?? mod.default ?? mod
    return uio
  } catch (e) {
    console.warn('uiohook-napi not available — click highlight disabled', e)
    return null
  }
}

function destroyOverlays(): void {
  for (const w of overlays) {
    if (!w.isDestroyed()) w.close()
  }
  overlays = []
}

function createOverlays(): void {
  destroyOverlays()
  const displays = screen.getAllDisplays()
  for (const display of displays) {
    const w = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        backgroundThrottling: false
      }
    })
    w.setAlwaysOnTop(true, 'screen-saver')
    w.setIgnoreMouseEvents(true, { forward: false })
    w.setMenuBarVisibility(false)

    const bounds = display.bounds
    const hash = `#click-overlay?x=${bounds.x}&y=${bounds.y}&w=${bounds.width}&h=${bounds.height}&id=${display.id}`
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void w.loadURL(process.env['ELECTRON_RENDERER_URL'] + hash)
    } else {
      void w.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.slice(1) })
    }
    w.once('ready-to-show', () => {
      if (!w.isDestroyed()) w.showInactive()
    })
    overlays.push(w)
  }
}

export function startClickHighlight(): void {
  if (listenerActive) return
  const u = loadUio()
  if (!u) return
  createOverlays()
  mouseHandler = (e): void => {
    // Forward each click to every overlay; renderer filters by its bounds
    for (const w of overlays) {
      if (!w.isDestroyed()) {
        w.webContents.send('click-overlay:click', { x: e.x, y: e.y, button: e.button })
      }
    }
  }
  u.on('mousedown', mouseHandler)
  try {
    u.start()
    listenerActive = true
  } catch (e) {
    console.error('uiohook start failed', e)
    if (mouseHandler) u.off('mousedown', mouseHandler)
    mouseHandler = null
    destroyOverlays()
  }
}

export function stopClickHighlight(): void {
  if (!listenerActive) {
    destroyOverlays()
    return
  }
  const u = loadUio()
  if (u) {
    try {
      if (mouseHandler) u.off('mousedown', mouseHandler)
      u.stop()
    } catch (e) {
      console.warn('uiohook stop failed', e)
    }
  }
  mouseHandler = null
  listenerActive = false
  destroyOverlays()
}

export function isClickHighlightAvailable(): boolean {
  return loadUio() !== null
}
