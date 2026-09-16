import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StaffAccessPage } from './StaffAccessPage'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'admin-1', full_name: 'IT Admin', email: 'admin@example.com', role: 'it_admin', is_active: true } }),
}))

const listStaffProfiles = vi.fn()
const listStaffAccessAudit = vi.fn()
vi.mock('../services/staff-access', () => ({
  listStaffProfiles: (...args: unknown[]) => listStaffProfiles(...args),
  listStaffAccessAudit: (...args: unknown[]) => listStaffAccessAudit(...args),
  inviteStaffUser: vi.fn(),
  updateStaffAccess: vi.fn(),
}))

describe('StaffAccessPage', () => {
  beforeEach(() => {
    listStaffProfiles.mockResolvedValue([{
      id: 'admin-1', email: 'admin@example.com', full_name: 'IT Admin', role: 'it_admin', is_active: true,
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    }])
    listStaffAccessAudit.mockResolvedValue([])
  })

  it('loads the IT Admin staff directory and audit area', async () => {
    render(<StaffAccessPage />)
    expect(await screen.findByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('Your account')).toBeInTheDocument()
    expect(screen.getByText('Recent access changes')).toBeInTheDocument()
  })
})
