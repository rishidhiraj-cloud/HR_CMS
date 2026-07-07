export type TargetType = 'all' | 'dept' | 'role' | 'company'

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
  mobile: string
  company: string
  department: string
  role: string
  is_active: boolean
}

export interface HrDocument {
  id: string
  name: string
  file_type: string
  file_url: string | null
  target_level: string | null
  company: string
}

export interface QuickLink {
  id: string
  company: string
  portal_name: string
  purpose: string
  how_to_use: string
  type: 'website' | 'mobile_app'
  url: string | null
  android_app_url: string | null
  ios_app_url: string | null
}

export interface Poll {
  id: string
  question: string
  options: string[]
  poll_type: string
  target_type: string
  target_value: string | null
  status: string
  expires_at: string | null
  created_at: string
  hasVoted: boolean
  myVote: number | null
  voteCounts: number[]
  totalVotes: number
}
