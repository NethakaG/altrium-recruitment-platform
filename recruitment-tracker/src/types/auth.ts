export const staffRoles = [
  'it_admin',
  'hr_recruiter',
  'interviewer',
  'hiring_manager',
  'management_user',
] as const

export type StaffRole = (typeof staffRoles)[number]

export interface StaffProfile {
  id: string
  email: string
  full_name: string | null
  role: StaffRole | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RoleDefinition {
  label: string
  shortLabel: string
  summary: string
  accent: string
  routes: readonly string[]
}

export const roleDefinitions: Record<StaffRole, RoleDefinition> = {
  it_admin: {
    label: 'IT Administrator',
    shortLabel: 'IT Admin',
    summary: 'Staff access and Supabase operations',
    accent: '#fcb400',
    routes: ['/', '/positions', '/workflows', '/candidates', '/staff-access'],
  },
  hr_recruiter: {
    label: 'HR / Recruiter',
    shortLabel: 'HR',
    summary: 'Positions, workflows, CVs and screening',
    accent: '#fcb400',
    routes: ['/', '/positions', '/workflows', '/candidates'],
  },
  interviewer: {
    label: 'Interviewer',
    shortLabel: 'Interviewer',
    summary: 'Assigned candidate reviews',
    accent: '#fcb400',
    routes: ['/', '/positions', '/workflows', '/assignments'],
  },
  hiring_manager: {
    label: 'Hiring Manager',
    shortLabel: 'Hiring Manager',
    summary: 'Candidate and screening review',
    accent: '#fcb400',
    routes: ['/', '/positions', '/workflows', '/candidate-review'],
  },
  management_user: {
    label: 'Management User / Executive',
    shortLabel: 'Management',
    summary: 'Read-only recruitment overview',
    accent: '#fcb400',
    routes: ['/', '/positions', '/workflows', '/overview'],
  },
}

export function canAccessPath(role: StaffRole, path: string): boolean {
  return roleDefinitions[role].routes.some((route) => route === path || (route !== '/' && path.startsWith(`${route}/`)))
}

export function canManagePositions(role: StaffRole): boolean {
  return role === 'it_admin' || role === 'hr_recruiter'
}

export function canManageCandidates(role: StaffRole): boolean {
  return role === 'it_admin' || role === 'hr_recruiter'
}

export function candidateBasePath(role: StaffRole): string {
  if (role === 'interviewer') return '/assignments'
  if (role === 'hiring_manager') return '/candidate-review'
  if (role === 'management_user') return '/overview'
  return '/candidates'
}

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && staffRoles.includes(value as StaffRole)
}
