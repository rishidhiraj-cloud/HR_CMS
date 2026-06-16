import { BrowserWindow, screen } from 'electron'
import path from 'path'

const POPUP_WIDTH = 494
const POPUP_HEIGHT = 520
const FEED_WIDTH = 390
const FEED_HEIGHT = 546

function getRendererPath(name: string): string {
  return path.join(__dirname, `../../dist/renderer/${name}/index.html`)
}

export function createPopupWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    x: width - POPUP_WIDTH - 20,
    y: height - POPUP_HEIGHT - 20,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadFile(getRendererPath('popup'))
  return win
}

export function createPollPopupWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: POPUP_WIDTH,
    height: 180,
    x: width - POPUP_WIDTH - 20,
    y: height - 180 - 20,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadFile(getRendererPath('popup'), { query: { mode: 'poll' } })
  return win
}

export function createFeedWindow(trayBounds: Electron.Rectangle): BrowserWindow {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

  // Position below the tray icon, clamped to screen
  const rawX = Math.round(trayBounds.x + trayBounds.width / 2 - FEED_WIDTH / 2)
  const x = Math.max(8, Math.min(rawX, screenWidth - FEED_WIDTH - 8))
  const y = trayBounds.y + trayBounds.height + 4

  const win = new BrowserWindow({
    width: FEED_WIDTH,
    height: FEED_HEIGHT,
    x,
    y,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadFile(getRendererPath('feed'))

  // Small delay before enabling blur-to-hide so window doesn't vanish immediately
  let blurEnabled = false
  setTimeout(() => { blurEnabled = true }, 300)
  win.on('blur', () => { if (blurEnabled) win.hide() })

  return win
}
