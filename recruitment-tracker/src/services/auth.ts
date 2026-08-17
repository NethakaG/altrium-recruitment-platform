import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabase'
import { isStaffRole, type StaffProfile } from '../types/auth'

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.getSession()
  if (error) throw error
  return data.session
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error || !data.session) throw error ?? new Error('Login failed.')
  return data.session
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut()
  if (error) throw error
}

export async function getStaffProfile(userId: string): Promise<StaffProfile | null> {
  const { data, error } = await getSupabaseClient()
    .from('staff_profiles')
    .select('id,email,full_name,role,is_active,created_at,updated_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    ...data,
    role: isStaffRole(data.role) ? data.role : null,
  } as StaffProfile
}
