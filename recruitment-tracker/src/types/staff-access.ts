import type { StaffProfile, StaffRole } from './auth'

export interface StaffAccessAudit {
  id: string
  staff_id: string
  changed_by: string
  action: 'profile_updated' | 'role_changed' | 'activated' | 'deactivated' | 'access_updated'
  previous_role: StaffRole | null
  new_role: StaffRole | null
  previous_is_active: boolean
  new_is_active: boolean
  previous_full_name: string | null
  new_full_name: string | null
  changed_at: string
  staff: Pick<StaffProfile, 'full_name' | 'email'> | null
  actor: Pick<StaffProfile, 'full_name' | 'email'> | null
}

export interface StaffInviteInput {
  email: string
  fullName: string
  role: StaffRole
}

export interface StaffAccessUpdate {
  staffId: string
  fullName: string
  role: StaffRole
  isActive: boolean
}
