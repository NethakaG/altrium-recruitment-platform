export type SubmissionErrorCode =
  | 'POSITION_CLOSED'
  | 'DUPLICATE_APPLICATION'
  | 'INVALID_FILE'
  | 'FILE_TOO_LARGE'
  | 'CONFIGURATION_ERROR'
  | 'EXTRACTION_FAILED'
  | 'CONTACT_NOT_FOUND'
  | 'SUBMISSION_FAILED'

export interface SubmissionResult {
  success: true
  submissionId?: string
  candidateName?: string
}

export interface CandidateContact {
  fullName: string
  email: string
  phone: string
}
