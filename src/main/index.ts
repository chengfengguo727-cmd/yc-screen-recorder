import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session as electronSession,
  globalShortcut,
  protocol,
  Tray,
  Menu,
  nativeImage
} from 'electron'
import * as fs from 'fs'
import { Readable } from 'stream'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpc } from './ipc'
import { registerRegionPickerIpc } from './region-picker'
import { initScheduler, stopScheduler } from './scheduler'
import { getPreferences } from './preferences'

const HIDDEN_FLAG = '--hidden'
const isAutoLaunched =
  process.argv.includes(HIDDEN_FLAG) || app.getLoginItemSettings().wasOpenedAtLogin

function applyLoginItem(): void {
  const prefs = getPreferences().getAll()
  try {
    app.setLoginItemSettings({
      openAtLogin: prefs.autoLaunch,
      path: process.execPath,
      args: prefs.autoLaunch ? [HIDDEN_FLAG] : []
    })
  } catch (e) {
    console.warn('setLoginItemSettings failed', e)
  }
}

// Disable Chromium's background throttling globally — required so audio
// capture and timers in the renderer keep running at full speed when the
// window is minimized (typical state for scheduled long recordings).
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quittingExplicitly = false

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(icon)
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon.resize({ width: 16, height: 16 }))
  tray.setToolTip('YC Screen Recorder')
  const rebuildMenu = (): void => {
    const ctx = Menu.buildFromTemplate([
      { label: '開啟主視窗', click: showWindow },
      { type: 'separator' },
      {
        label: '開始錄影 / 停止 (Ctrl+Shift+R)',
        click: () => mainWindow?.webContents.send('app:hotkey', 'toggle-record')
      },
      {
        label: '截圖 (Ctrl+Shift+S)',
        click: () => mainWindow?.webContents.send('app:hotkey', 'screenshot')
      },
      { type: 'separator' },
      {
        label: '結束程式',
        click: () => {
          quittingExplicitly = true
          app.quit()
        }
      }
    ])
    tray?.setContextMenu(ctx)
  }
  rebuildMenu()
  tray.on('double-click', showWindow)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'YC Screen Recorder',
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Disable Chromium's background throttling so audio capture & timers
      // keep running when the window is minimized or unfocused. Critical for
      // long / scheduled recordings — otherwise FFmpeg stalls waiting on
      // audio pipe and dumps video frames.
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    const prefs = getPreferences().getAll()
    if (isAutoLaunched && prefs.startMinimized) {
      // Stay hidden in tray; user can restore via tray icon
      return
    }
    mainWindow?.show()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  // Close button minimizes to tray instead of quitting (unless explicit quit)
  mainWindow.on('close', (event) => {
    if (!quittingExplicitly && tray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // When auto-launched and auto-start enabled, kick off recording after the
  // renderer has loaded its preferences & state.
  mainWindow.webContents.once('did-finish-load', () => {
    if (!isAutoLaunched) return
    if (!getPreferences().get('autoStartRecording')) return
    // Small delay so renderer can hydrate audio device list etc.
    setTimeout(() => {
      mainWindow?.webContents.send('app:auto-start-record')
    }, 1500)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.yc.screen-recorder')

  // media://media/?p=<encoded-absolute-path>
  // Range-aware streaming so the renderer's <video> can seek without
  // downloading the full file (our MP4s don't have +faststart).
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url)
      const p = url.searchParams.get('p')
      if (!p) return new Response('missing p', { status: 400 })
      const filePath = decodeURIComponent(p)

      const stat = await fs.promises.stat(filePath)
      const fileSize = stat.size
      const ext = filePath.toLowerCase().split('.').pop() || ''
      const contentType =
        ext === 'mp4'
          ? 'video/mp4'
          : ext === 'webm'
            ? 'video/webm'
            : ext === 'mkv'
              ? 'video/x-matroska'
              : ext === 'png'
                ? 'image/png'
                : ext === 'srt'
                  ? 'text/plain; charset=utf-8'
                  : 'application/octet-stream'

      const rangeHeader = request.headers.get('range')
      let start = 0
      let end = fileSize - 1
      let status = 200
      if (rangeHeader) {
        const m = /bytes=(\d+)-(\d+)?/.exec(rangeHeader)
        if (m) {
          start = parseInt(m[1], 10)
          end = m[2] ? parseInt(m[2], 10) : fileSize - 1
          if (end >= fileSize) end = fileSize - 1
          status = 206
        }
      }

      const nodeStream = fs.createReadStream(filePath, { start, end })
      const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>

      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes'
      }
      if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`

      return new Response(webStream, { status, headers })
    } catch (e) {
      return new Response(`media protocol error: ${(e as Error).message}`, { status: 500 })
    }
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  electronSession.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] })
        callback({ video: sources[0], audio: 'loopback' })
      } catch {
        callback({})
      }
    },
    { useSystemPicker: false }
  )

  ipcMain.on('ping', () => console.log('pong'))
  registerIpc(() => mainWindow)
  registerRegionPickerIpc()
  initScheduler(() => mainWindow)

  ipcMain.handle('app:quit', () => {
    quittingExplicitly = true
    app.quit()
  })
  ipcMain.handle('app:minimize-to-tray', () => {
    mainWindow?.hide()
  })
  ipcMain.handle('app:apply-login-item', () => {
    applyLoginItem()
    return app.getLoginItemSettings()
  })
  ipcMain.handle('app:get-login-item-status', () => app.getLoginItemSettings())

  // Sync system login item state with preferences on every startup
  applyLoginItem()

  createWindow()
  createTray()

  const sendHotkey = (action: string): void => {
    mainWindow?.webContents.send('app:hotkey', action)
  }
  globalShortcut.register('CommandOrControl+Shift+R', () => sendHotkey('toggle-record'))
  globalShortcut.register('CommandOrControl+Shift+S', () => sendHotkey('screenshot'))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Stay alive in tray; user must explicitly Quit
  if (process.platform === 'darwin') return
  // No tray (init failed): quit normally
  if (!tray) app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopScheduler()
})
