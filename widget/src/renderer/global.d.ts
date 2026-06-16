import type { Message, Employee, HrDocument, Poll } from '../shared/types'

interface HrWidgetAPI {
  login(email: string, password: string): Promise<{ error?: string }>
  logout(): Promise<void>
  getEmployee(): Promise<Employee | null>
  getMessages(): Promise<Message[]>
  getUnseenIds(): Promise<string[]>
  markSeen(id: string): Promise<void>
  openFeed(): Promise<void>
  openFeedToPolls(): Promise<void>
  onNewMessage(cb: (msg: Message) => void): () => void
  onShowUnread(cb: () => void): () => void
  onShowPolls(cb: () => void): () => void
  onMessageMarkedSeen(cb: (id: string) => void): () => void
  onDisabled(cb: () => void): () => void
  askHr(question: string): Promise<{ answer?: string; sources?: string[]; error?: string }>
  getDocuments(): Promise<HrDocument[]>
  openDocumentUrl(url: string): Promise<void>
  logDocumentAccess(documentId: string): Promise<void>
  getPolls(): Promise<Poll[]>
  votePoll(pollId: string, optionIndex: number): Promise<{ voteCounts?: number[]; totalVotes?: number; error?: string }>
  clearPollBadge(): Promise<void>
  getPollPopup(): Promise<Poll | null>
  onNewPoll(cb: () => void): () => void
}

declare global {
  interface Window {
    hrWidget: HrWidgetAPI
  }
}
