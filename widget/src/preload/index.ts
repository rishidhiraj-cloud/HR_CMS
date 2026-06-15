import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hrWidget', {
  login: (email: string, password: string) =>
    ipcRenderer.invoke('auth:login', email, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getEmployee: () => ipcRenderer.invoke('auth:getEmployee'),

  getMessages: () => ipcRenderer.invoke('messages:getAll'),
  markSeen: (id: string) => ipcRenderer.invoke('messages:markSeen', id),

  onNewMessage: (cb: (msg: unknown) => void) => {
    ipcRenderer.on('message:new', (_event, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('message:new')
  },
})
