import { getSupabaseClient } from '../lib/supabase'
import type { CalendarEvent, CalendarEventInput, CalendarHoliday, WorkingHours } from '../types/interviews'

export async function listWorkingHours(interviewerId?: string): Promise<WorkingHours[]> {
  let query = getSupabaseClient().from('interviewer_working_hours').select('*').order('weekday')
  if (interviewerId) query = query.eq('interviewer_id', interviewerId)
  const { data, error } = await query; if (error) throw error
  return (data ?? []) as WorkingHours[]
}

export async function listCalendarHolidays(year = 2026): Promise<CalendarHoliday[]> {
  const { data, error } = await getSupabaseClient().from('calendar_holidays').select('*').gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year}-12-31`).order('holiday_date')
  if (error) throw error
  return (data ?? []) as CalendarHoliday[]
}

export async function listCalendarEvents(interviewerId?: string): Promise<CalendarEvent[]> {
  let query = getSupabaseClient().from('interviewer_calendar_events').select('*').order('starts_at')
  if (interviewerId) query = query.eq('interviewer_id', interviewerId)
  const { data, error } = await query; if (error) throw error
  return (data ?? []) as CalendarEvent[]
}

export async function createCalendarEvent(input: CalendarEventInput) {
  const { data, error } = await getSupabaseClient().rpc('create_calendar_event', { p_title: input.title, p_event_type: input.eventType, p_starts_at: input.start, p_ends_at: input.end, p_notes: input.notes || null })
  if (error) throw error
  return data as string
}

export async function updateCalendarEvent(id: string, input: CalendarEventInput) {
  const { error } = await getSupabaseClient().rpc('update_calendar_event', { p_event_id: id, p_title: input.title, p_event_type: input.eventType, p_starts_at: input.start, p_ends_at: input.end, p_notes: input.notes || null })
  if (error) throw error
}

export async function deleteCalendarEvent(id: string) {
  const { error } = await getSupabaseClient().rpc('delete_calendar_event', { p_event_id: id })
  if (error) throw error
}
