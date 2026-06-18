import { BrowserWindow, screen } from 'electron'
import path from 'path'

const POPUP_WIDTH = 494
const POPUP_HEIGHT = 520
const FEED_WIDTH = 390
const FEED_HEIGHT = 546
const EDGE_MARGIN = 12  // gap from the screen edges (shared so windows line up)

function getRendererPath(name: string): string {
  return path.join(__dirname, `../../dist/renderer/${name}/index.html`)
}

export function createPopupWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()

  const win = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    x: workArea.x + workArea.width - POPUP_WIDTH - EDGE_MARGIN,
    y: workArea.y + workArea.height - POPUP_HEIGHT - EDGE_MARGIN,
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
  const { workArea } = screen.getPrimaryDisplay()

  const win = new BrowserWindow({
    width: POPUP_WIDTH,
    height: 180,
    x: workArea.x + workArea.width - POPUP_WIDTH - EDGE_MARGIN,
    y: workArea.y + workArea.height - 180 - EDGE_MARGIN,
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

export function createFeedWindow(_trayBounds: Electron.Rectangle): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()

  // Anchor to the bottom-right corner, just above the taskbar. Tray-relative
  // positioning is unreliable on Windows when the icon sits in the hidden-icons
  // overflow flyout (getBounds() returns the flyout/origin), so we pin the corner.
  const x = workArea.x + workArea.width - FEED_WIDTH - EDGE_MARGIN
  const y = workArea.y + workArea.height - FEED_HEIGHT - EDGE_MARGIN

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
