export type TargetType = 'all' | 'dept' | 'role'

export interface Message {
  id: string
  title: string
  content_html: string
  target_type: TargetType
  target_value: string | null
  scheduled_at: string | null
  published_at: string | null
  created_by: string
  created_at: string
}

export interface Employee {
  id: string
  name: string
  email: string
  mobile: string
  password: string
  department: string
  role: string
}

export interface HrUser {
  id: string
  name: string
  email: string
}

export type MessageStatus = 'draft' | 'scheduled' | 'live' | 'archived'

export function getMessageStatus(msg: Pick<Message, 'published_at' | 'scheduled_at'>): MessageStatus {
  if (msg.published_at) {
    const published = new Date(msg.published_at)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    return published < thirtyDaysAgo ? 'archived' : 'live'
  }
  if (msg.scheduled_at) return 'scheduled'
  return 'draft'
}
