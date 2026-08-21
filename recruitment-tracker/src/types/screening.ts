export interface ScreeningCriterion {
  id: string
  name: string
  description: string
  weight: number
}

export interface ScreeningRubric {
  position_id: string
  criteria: ScreeningCriterion[]
  shortlist_count: number
  locked_at: string
}

export interface CriterionScore {
  criterion_id: string
  score: number
  evidence: string
}

export interface CandidateScreening {
  criterion_scores: CriterionScore[]
  total_score: number
  summary: string
  screening_model: string
  screened_at: string
  rank: number | null
  decision: 'Shortlisted' | 'Rejected' | null
}
