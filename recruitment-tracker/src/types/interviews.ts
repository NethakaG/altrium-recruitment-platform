export type InterviewFormat = 'online' | 'physical'
export type InterviewStatus = 'scheduled' | 'in_progress' | 'awaiting_feedback' | 'completed' | 'cancelled'
export type NotificationStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'

export interface InterviewerProfile {
  id: string
  staff_id: string | null
  display_name: string
  contact_email: string | null
  years_experience: number
  role_title: string
  professional_summary: string
  specializations: string[]
  eligible_stage_types: string[]
  is_active: boolean
}

export type CalendarEventType = 'meeting' | 'unavailable'

export interface WorkingHours {
  id: string
  interviewer_id: string
  weekday: number
  starts_at: string
  ends_at: string
  is_working: boolean
}

export interface CalendarHoliday {
  holiday_date: string
  name: string
  country_code: 'LK'
}

export interface CalendarEvent {
  id: string
  interviewer_id: string
  title: string
  event_type: CalendarEventType
  starts_at: string
  ends_at: string
  notes: string | null
  created_by: string | null
}

export interface CalendarEventInput {
  title: string
  eventType: CalendarEventType
  start: string
  end: string
  notes?: string
}

export interface InterviewNotification {
  id: string
  notification_type: string
  recipient_kind: 'candidate' | 'interviewer'
  status: NotificationStatus
  scheduled_for: string
  sent_at: string | null
  last_error: string | null
}

export interface Interview {
  id: string
  submission_id: string
  stage_id: string
  interviewer_id: string
  scheduled_start: string
  scheduled_end: string
  format: InterviewFormat
  meeting_url: string | null
  location: string | null
  instructions: string | null
  status: InterviewStatus
  actual_start: string | null
  actual_end: string | null
  cancellation_reason: string | null
  candidate: { id: string; candidate_name: string | null; candidate_email: string | null } | null
  position: { title: string; department: string } | null
  stage: { name: string; stage_type: string } | null
  interviewer: InterviewerProfile | null
  notifications: InterviewNotification[]
}

export interface InterviewInput {
  submissionId: string
  interviewerId: string
  start: string
  end: string
  format: InterviewFormat
  meetingUrl?: string
  location?: string
  instructions?: string
}
