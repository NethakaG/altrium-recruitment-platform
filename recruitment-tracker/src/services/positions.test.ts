import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn() }))

vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ from: supabaseMocks.from, functions: { invoke: supabaseMocks.invoke } }) }))

import { closePosition, createPosition } from './positions'

const position = {
  id: 'position-1', title: 'Marketing Intern', department: 'Marketing', description: 'Role', requirements: null,
  qualifications: null, hiring_manager: null, opening_date: '2026-08-17', status: 'Open', workflow_configured: false, created_at: '', updated_at: '',
  rubric_configured: false, screening_status: 'Not started', screening_error: null, screening_started_at: null,
  screening_completed_at: null, closed_at: null,
}

describe('position persistence', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trims position data and leaves optional values null when creating', async () => {
    const single = vi.fn().mockResolvedValue({ data: position, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    supabaseMocks.from.mockReturnValue({ insert })

    await createPosition({ title: ' Marketing Intern ', department: ' Marketing ', description: ' Role ', requirements: ' ', qualifications: '', hiringManager: '', openingDate: '2026-08-17' })

    const payload = insert.mock.calls[0][0]
    expect(payload).toEqual(expect.objectContaining({
      title: 'Marketing Intern', department: 'Marketing', description: 'Role', requirements: null, qualifications: null, hiring_manager: null,
    }))
    expect(payload).not.toHaveProperty('status')
  })

  it('starts authenticated screening and reloads the closed position', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { ...position, status: 'Closed', screening_status: 'Processing' }, error: null })
    const is = vi.fn().mockReturnValue({ maybeSingle })
    const eq = vi.fn().mockReturnValue({ is })
    const select = vi.fn().mockReturnValue({ eq })
    supabaseMocks.from.mockReturnValue({ select })
    supabaseMocks.invoke.mockResolvedValue({ data: { success: true }, error: null })

    const result = await closePosition('position-1')

    expect(supabaseMocks.invoke).toHaveBeenCalledWith('screen-position', { body: { positionId: 'position-1' } })
    expect(result.screening_status).toBe('Processing')
  })
})
