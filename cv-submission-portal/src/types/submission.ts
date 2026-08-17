export type SubmissionErrorCode =
  | 'POSITION_CLOSED'
  | 'DUPLICATE_APPLICATION'
  | 'INVALID_FILE'
  | 'FILE_TOO_LARGE'
  | 'CONFIGURATION_ERROR'
  | 'SUBMISSION_FAILED'

export interface SubmissionResult {
  success: true
}

export interface CandidateContact {
  fullName: string
  email: string
  phone: string
}
