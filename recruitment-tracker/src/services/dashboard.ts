import type { StaffProfile, StaffRole } from '../types/auth'
import type { Candidate } from '../types/candidates'
import type { FinalHiringDecision } from '../types/final-decisions'
import type { Interview } from '../types/interviews'
import type { Position } from '../types/positions'
import { listCandidates } from './candidates'
import { listFinalHiringDecisions } from './final-decisions'
import { listInterviews } from './interviews'
import { listPositions } from './positions'
import { listStaffProfiles } from './staff-access'

export interface DashboardData {
  positions: Position[]
  candidates: Candidate[]
  interviews: Interview[]
  decisions: FinalHiringDecision[]
  staff: StaffProfile[]
}

export async function loadDashboardData(role: StaffRole): Promise<DashboardData> {
  const candidatesAllowed = role !== 'interviewer'
  const interviewsAllowed = role === 'it_admin' || role === 'hr_recruiter' || role === 'interviewer'
  const decisionsAllowed = role !== 'interviewer'
  const staffAllowed = role === 'it_admin'

  const [positions, candidates, interviews, decisions, staff] = await Promise.all([
    listPositions(),
    candidatesAllowed ? listCandidates() : Promise.resolve([]),
    interviewsAllowed ? listInterviews() : Promise.resolve([]),
    decisionsAllowed ? listFinalHiringDecisions() : Promise.resolve([]),
    staffAllowed ? listStaffProfiles() : Promise.resolve([]),
  ])

  return { positions, candidates, interviews, decisions, staff }
}
