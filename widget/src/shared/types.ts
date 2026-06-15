export type TargetType = 'all' | 'dept' | 'role'

export interface Message {
  id: string
  title: string
  content_html: string
  target_type: TargetType
  target_value: string | null
  scheduled_at: string | null
  published_at: string | null
  created_at: string
}

export interface Employee {
  id: string
  name: string
  email: string
  department: string
  role: string
}
