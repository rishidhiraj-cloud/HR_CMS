import { app, Tray, Menu, nativeImage } from 'electron'
import path from 'path'

export function createTray(onClick: () => void): Tray {
  // trayIcon.png is placed directly in Resources/ via extraResources in electron-builder
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'trayIcon.png')
    : path.join(__dirname, '../../assets/trayIcon.png')

  let icon = nativeImage.createFromPath(iconPath)

  if (icon.isEmpty()) {
    // Fallback: tiny 1px transparent placeholder so Tray() doesn't throw
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    )
  }
  icon.setTemplateImage(false)

  const tray = new Tray(icon)
  tray.setToolTip('M-Connect')
  tray.setTitle('M-Connect')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Announcements', click: onClick },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ])

  // On macOS setContextMenu overrides click — handle each separately
  if (process.platform === 'darwin') {
    tray.on('click', onClick)
    tray.on('right-click', () => tray.popUpContextMenu(contextMenu))
  } else {
    tray.on('click', onClick)
    tray.setContextMenu(contextMenu)
  }

  return tray
}

export function setBadge(tray: Tray, count: number): void {
  tray.setTitle(count > 0 ? `M-Connect ${count}` : 'M-Connect')
}
