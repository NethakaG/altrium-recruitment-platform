import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ from: supabaseMocks.from }) }))

import { closePosition, createPosition } from './positions'

const position = {
  id: 'position-1', title: 'Marketing Intern', department: 'Marketing', description: 'Role', requirements: null,
  qualifications: null, hiring_manager: null, opening_date: '2026-08-17', status: 'Open', workflow_configured: false, created_at: '', updated_at: '',
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

  it('only requests the Open to Closed transition', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { ...position, status: 'Closed' }, error: null })
    const select = vi.fn().mockReturnValue({ maybeSingle })
    const secondEq = vi.fn().mockReturnValue({ select })
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq })
    const update = vi.fn().mockReturnValue({ eq: firstEq })
    supabaseMocks.from.mockReturnValue({ update })

    await closePosition('position-1')

    expect(update).toHaveBeenCalledWith({ status: 'Closed' })
    expect(firstEq).toHaveBeenCalledWith('id', 'position-1')
    expect(secondEq).toHaveBeenCalledWith('status', 'Open')
  })
})
