import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hrWidget', {
  login: (email: string, password: string) =>
    ipcRenderer.invoke('auth:login', email, password),
  loginWithMicrosoft: () =>
    ipcRenderer.invoke('auth:loginMicrosoft'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getEmployee: () => ipcRenderer.invoke('auth:getEmployee'),

  getMessages: () => ipcRenderer.invoke('messages:getAll'),
  getUnseenIds: () => ipcRenderer.invoke('messages:getUnseenIds'),
  markSeen: (id: string) => ipcRenderer.invoke('messages:markSeen', id),
  openFeed: () => ipcRenderer.invoke('window:openFeed'),
  openFeedToPolls: () => ipcRenderer.invoke('window:openFeedToPolls'),

  onNewMessage: (cb: (msg: unknown) => void) => {
    ipcRenderer.on('message:new', (_event, msg) => cb(msg))
    return () => ipcRenderer.removeAllListeners('message:new')
  },
  onShowUnread: (cb: () => void) => {
    ipcRenderer.on('feed:showUnread', () => cb())
    return () => ipcRenderer.removeAllListeners('feed:showUnread')
  },
  onShowPolls: (cb: () => void) => {
    ipcRenderer.on('feed:showPolls', () => cb())
    return () => ipcRenderer.removeAllListeners('feed:showPolls')
  },
  onMessageMarkedSeen: (cb: (id: string) => void) => {
    ipcRenderer.on('feed:markedSeen', (_event, id) => cb(id))
    return () => ipcRenderer.removeAllListeners('feed:markedSeen')
  },
  onDisabled: (cb: () => void) => {
    ipcRenderer.on('employee:disabled', () => cb())
    return () => ipcRenderer.removeAllListeners('employee:disabled')
  },

  askHr: (question: string) => ipcRenderer.invoke('hr:ask', question),
  getDocuments: () => ipcRenderer.invoke('documents:getAll'),
  openDocumentUrl: (url: string) => ipcRenderer.invoke('documents:openUrl', url),
  logDocumentAccess: (documentId: string) => ipcRenderer.invoke('documents:logAccess', documentId),
  getPolls: () => ipcRenderer.invoke('polls:getActive'),
  votePoll: (pollId: string, optionIndex: number) => ipcRenderer.invoke('polls:vote', pollId, optionIndex),
  clearPollBadge: () => ipcRenderer.invoke('polls:clearBadge'),
  getPollPopup: () => ipcRenderer.invoke('polls:getPopupPoll'),
  onNewPoll: (cb: () => void) => {
    ipcRenderer.on('poll:new', () => cb())
    return () => ipcRenderer.removeAllListeners('poll:new')
  },
  onRequestPasscode: (cb: (action: 'quit') => void) => {
    ipcRenderer.on('app:requestPasscode', (_event, action) => cb(action))
    return () => ipcRenderer.removeAllListeners('app:requestPasscode')
  },
  quitApp: () => ipcRenderer.invoke('app:quit'),
  minimizeWidget: () => ipcRenderer.invoke('widget:minimize'),
  setExpanded: (expanded: boolean) => ipcRenderer.invoke('widget:setExpanded', expanded),
  onUpdateReady: (cb: () => void) => {
    ipcRenderer.on('app:updateReady', () => cb())
    return () => ipcRenderer.removeAllListeners('app:updateReady')
  },
  isUpdateReady: () => ipcRenderer.invoke('app:isUpdateReady'),
  openReleasePage: () => ipcRenderer.invoke('app:openReleasePage'),
})
