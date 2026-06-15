import { BrowserWindow, screen } from 'electron'
import path from 'path'

const POPUP_WIDTH = 380
const POPUP_HEIGHT = 400
const FEED_WIDTH = 300
const FEED_HEIGHT = 420

function getRendererPath(name: string): string {
  return `file://${path.join(__dirname, `../../dist/renderer/${name}/index.html`)}`
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

  win.loadURL(getRendererPath('popup'))
  return win
}

export function createFeedWindow(trayBounds: Electron.Rectangle): BrowserWindow {
  const { width } = screen.getPrimaryDisplay().workAreaSize

  const x = process.platform === 'darwin'
    ? Math.round(trayBounds.x - FEED_WIDTH / 2)
    : width - FEED_WIDTH - 10

  const y = process.platform === 'darwin'
    ? trayBounds.y + trayBounds.height + 4
    : trayBounds.y - FEED_HEIGHT - 4

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

  win.loadURL(getRendererPath('feed'))
  win.on('blur', () => win.hide())
  return win
}
