import { getSupabaseClient } from '../lib/supabase'
import type { Position, PositionRow } from '../types/position'

export function filterAvailablePositions(rows: PositionRow[]): Position[] {
  return rows
    .filter((position) => position.status === 'Open' && position.archived_at === null && position.workflow_configured)
    .map(({ id, title, department }) => ({ id, title, department }))
}

export async function loadOpenPositions(): Promise<Position[]> {
  const { data, error } = await getSupabaseClient()
    .from('positions')
    .select('id,title,department,status,archived_at,workflow_configured')
    .eq('status', 'Open')
    .is('archived_at', null)
    .eq('workflow_configured', true)
    .order('title', { ascending: true })

  if (error) {
    throw new Error('Unable to load positions.', { cause: error })
  }

  return filterAvailablePositions((data ?? []) as PositionRow[])
}
