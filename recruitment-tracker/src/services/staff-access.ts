import { getSupabaseClient } from '../lib/supabase'
import { isStaffRole, type StaffProfile } from '../types/auth'
import type { StaffAccessAudit, StaffAccessUpdate, StaffInviteInput } from '../types/staff-access'

const staffFields = 'id,email,full_name,role,is_active,created_at,updated_at'

function normalizeStaff(row: Record<string, unknown>): StaffProfile {
  return { ...row, role: isStaffRole(row.role) ? row.role : null } as StaffProfile
}

export async function listStaffProfiles(): Promise<StaffProfile[]> {
  const { data, error } = await getSupabaseClient()
    .from('staff_profiles')
    .select(staffFields)
    .order('is_active', { ascending: false })
    .order('full_name')
  if (error) throw error
  return (data ?? []).map((row) => normalizeStaff(row as Record<string, unknown>))
}

export async function listStaffAccessAudit(): Promise<StaffAccessAudit[]> {
  const { data, error } = await getSupabaseClient()
    .from('staff_access_audit')
    .select(`
      id,staff_id,changed_by,action,previous_role,new_role,previous_is_active,new_is_active,
      previous_full_name,new_full_name,changed_at,
      staff:staff_profiles!staff_access_audit_staff_id_fkey(full_name,email),
      actor:staff_profiles!staff_access_audit_changed_by_fkey(full_name,email)
    `)
    .order('changed_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as unknown as StaffAccessAudit[]
}

export async function updateStaffAccess(input: StaffAccessUpdate): Promise<StaffProfile> {
  const { data, error } = await getSupabaseClient().rpc('update_staff_access', {
    p_staff_id: input.staffId,
    p_full_name: input.fullName.trim(),
    p_role: input.role,
    p_is_active: input.isActive,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('The updated staff account could not be reloaded.')
  return normalizeStaff(row as Record<string, unknown>)
}

async function functionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: Response } | null)?.context
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json() as { error?: string }
      if (body.error) return body.error
    } catch {
      // Fall through to the safe user-facing message.
    }
  }
  return error instanceof Error && error.message !== 'Edge Function returned a non-2xx status code' ? error.message : fallback
}

export async function inviteStaffUser(input: StaffInviteInput): Promise<string> {
  const { data, error } = await getSupabaseClient().functions.invoke<{ message?: string }>('invite-staff-user', {
    body: { email: input.email.trim(), fullName: input.fullName.trim(), role: input.role },
  })
  if (error) throw new Error(await functionErrorMessage(error, 'The staff invitation could not be sent.'))
  return data?.message ?? `Invitation sent to ${input.email.trim()}.`
}
