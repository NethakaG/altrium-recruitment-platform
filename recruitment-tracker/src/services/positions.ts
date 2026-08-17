import { getSupabaseClient } from '../lib/supabase'
import type { Position, PositionInput } from '../types/positions'

const positionFields = 'id,title,department,description,requirements,qualifications,hiring_manager,opening_date,status,workflow_configured,created_at,updated_at'

function optionalValue(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

export async function listPositions(): Promise<Position[]> {
  const { data, error } = await getSupabaseClient()
    .from('positions')
    .select(positionFields)
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Position[]
}

export async function getPosition(positionId: string): Promise<Position | null> {
  const { data, error } = await getSupabaseClient()
    .from('positions')
    .select(positionFields)
    .eq('id', positionId)
    .is('archived_at', null)
    .maybeSingle()

  if (error) throw error
  return data as Position | null
}

export async function createPosition(input: PositionInput): Promise<Position> {
  const { data, error } = await getSupabaseClient()
    .from('positions')
    .insert({
      title: input.title.trim(),
      department: input.department.trim(),
      description: input.description.trim(),
      requirements: optionalValue(input.requirements),
      qualifications: optionalValue(input.qualifications),
      hiring_manager: optionalValue(input.hiringManager),
      opening_date: input.openingDate,
    })
    .select(positionFields)
    .single()

  if (error) throw error
  return data as Position
}

export async function closePosition(positionId: string): Promise<Position> {
  const { data, error } = await getSupabaseClient()
    .from('positions')
    .update({ status: 'Closed' })
    .eq('id', positionId)
    .eq('status', 'Open')
    .select(positionFields)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('This position is no longer open or you do not have permission to close it.')
  return data as Position
}
