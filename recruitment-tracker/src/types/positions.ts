export type PositionStatus = 'Open' | 'Closed'

export interface Position {
  id: string
  title: string
  department: string
  description: string
  requirements: string | null
  qualifications: string | null
  hiring_manager: string | null
  opening_date: string
  status: PositionStatus
  workflow_configured: boolean
  rubric_configured: boolean
  screening_status: 'Not started' | 'Processing' | 'Completed' | 'Failed'
  screening_error: string | null
  screening_started_at: string | null
  screening_completed_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface PositionInput {
  title: string
  department: string
  description: string
  requirements: string
  qualifications: string
  hiringManager: string
  openingDate: string
}

export type PositionFormErrors = Partial<Record<keyof PositionInput, string>>

export const emptyPositionInput: PositionInput = {
  title: '',
  department: '',
  description: '',
  requirements: '',
  qualifications: '',
  hiringManager: '',
  openingDate: new Date().toISOString().slice(0, 10),
}
