import { app } from 'electron'

// Registers the app to auto-launch at OS login (per-user) so the tray icon
// survives a restart instead of only running until the user manually quits
// or reboots. Safe/idempotent to call on every launch.
export function registerLoginItem(): void {
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true, // mac only — launch without opening a window
  })
}
