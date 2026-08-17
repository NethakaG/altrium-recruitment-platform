import type { StageType } from './workflows'

export type ApplicationStatus = 'Active' | 'Rejected' | 'Hired' | 'Withdrawn'
export type ProcessingStatus = 'Pending' | 'Processing' | 'Processed' | 'Failed'

export interface EducationEntry {
  institution: string
  qualification: string
  field: string
  start_year: string
  end_year: string
}

export interface ExperienceEntry {
  employer: string
  title: string
  start_date: string
  end_date: string
  description: string
}

export interface ExtractedProfile {
  extracted_name?: string
  extracted_email?: string
  extracted_phone?: string
  location?: string
  linkedin_url?: string
  professional_summary?: string
  skills?: string[]
  education?: EducationEntry[]
  experience?: ExperienceEntry[]
}

export interface CandidatePosition {
  title: string
  department: string
}

export interface CandidateStage {
  id: string
  name: string
  stage_order: number
  stage_type: StageType
}

export interface Candidate {
  id: string
  position_id: string
  candidate_name: string | null
  candidate_email: string | null
  candidate_phone: string | null
  original_filename: string
  mime_type: string
  file_size: number
  processing_status: ProcessingStatus
  submitted_at: string
  processed_at: string | null
  current_stage_id: string | null
  application_status: ApplicationStatus
  extracted_profile: ExtractedProfile
  extraction_model: string | null
  position: CandidatePosition
  current_stage: CandidateStage | null
}
