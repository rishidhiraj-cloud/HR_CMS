import { Tray, Menu, nativeImage } from 'electron'
import path from 'path'

export function createTray(onClick: () => void): Tray {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, '../../assets/icon.png'))
    .resize({ width: 16, height: 16 })

  const tray = new Tray(icon)
  tray.setToolTip('HR Announcements')
  tray.on('click', onClick)

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Announcements', click: onClick },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]))

  return tray
}

export function setBadge(tray: Tray, count: number): void {
  tray.setTitle(count > 0 ? String(count) : '')
}
