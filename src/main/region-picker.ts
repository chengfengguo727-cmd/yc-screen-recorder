import { BrowserWindow, screen, ipcMain, app, desktopCapturer } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export interface RegionResult {
  displayId: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

export interface PickerRectPayload {
  displayId: number
  // values in DIPs, local to the display
  x: number
  y: number
  w: number
  h: number
}

let active: {
  windows: BrowserWindow[]
  resolve: (r: RegionResult | null) => void
} | null = null

const bgImages = new Map<number, string>()

function closeAll(): void {
  if (!active) return
  for (const w of active.windows) {
    if (!w.isDestroyed()) w.close()
  }
  active = null
}

async function captureBackgrounds(): Promise<void> {
  bgImages.clear()
  const displays = screen.getAllDisplays()
  try {
    const maxWidth = Math.max(
      ...displays.map((d) => Math.round(d.bounds.width * d.scaleFactor))
    )
    const maxHeight = Math.max(
      ...displays.map((d) => Math.round(d.bounds.height * d.scaleFactor))
    )
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxWidth, height: maxHeight }
    })
    for (const display of displays) {
      const src = sources.find((s) => s.display_id === String(display.id))
      if (src && !src.thumbnail.isEmpty()) {
        bgImages.set(display.id, src.thumbnail.toDataURL())
      }
    }
  } catch (e) {
    console.error('region-picker: capture backgrounds failed', e)
  }
}

export function registerRegionPickerIpc(): void {
  ipcMain.handle('region:get-bg', (_evt, displayId: number) => {
    return bgImages.get(displayId) ?? null
  })

  ipcMain.handle('region:pick', async () => {
    if (active) {
      active.resolve(null)
      closeAll()
    }
    await captureBackgrounds()
    return new Promise<RegionResult | null>((resolve) => {
      const displays = screen.getAllDisplays()
      const windows: BrowserWindow[] = []
      active = { windows, resolve }

      for (const display of displays) {
        const overlay = new BrowserWindow({
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
          minimizable: false,
          maximizable: false,
          skipTaskbar: true,
          focusable: true,
          backgroundColor: '#00000000',
          webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            additionalArguments: [`--display-id=${display.id}`]
          }
        })
        overlay.setAlwaysOnTop(true, 'screen-saver')
        overlay.setMenuBarVisibility(false)
        overlay.setIgnoreMouseEvents(false)
        overlay.on('ready-to-show', () => overlay.show())

        const hash = `#region-picker?displayId=${display.id}`
        if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
          void overlay.loadURL(process.env['ELECTRON_RENDERER_URL'] + hash)
        } else {
          void overlay.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.slice(1) })
        }
        windows.push(overlay)
      }
    })
  })

  ipcMain.on('region:submit', (_evt, payload: PickerRectPayload) => {
    if (!active) return
    const display = screen.getAllDisplays().find((d) => d.id === payload.displayId)
    if (!display) {
      active.resolve(null)
      closeAll()
      return
    }
    const sf = display.scaleFactor
    // Round to even pixels so encoders are happy
    const round2 = (n: number): number => Math.max(2, Math.round(n / 2) * 2)
    active.resolve({
      displayId: display.id,
      offsetX: Math.max(0, Math.round(payload.x * sf)),
      offsetY: Math.max(0, Math.round(payload.y * sf)),
      width: round2(payload.w * sf),
      height: round2(payload.h * sf)
    })
    closeAll()
  })

  ipcMain.on('region:cancel', () => {
    if (!active) return
    active.resolve(null)
    closeAll()
  })
}

// Allow programmatic close (e.g. when app quits)
app.on('before-quit', () => {
  if (active) {
    active.resolve(null)
    closeAll()
  }
})
