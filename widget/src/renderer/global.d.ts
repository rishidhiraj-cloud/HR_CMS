import type { Message, Employee } from '../shared/types'

interface HrWidgetAPI {
  login(email: string, password: string): Promise<{ error?: string }>
  logout(): Promise<void>
  getEmployee(): Promise<Employee | null>
  getMessages(): Promise<Message[]>
  markSeen(id: string): Promise<void>
  onNewMessage(cb: (msg: Message) => void): () => void
}

declare global {
  interface Window {
    hrWidget: HrWidgetAPI
  }
}
