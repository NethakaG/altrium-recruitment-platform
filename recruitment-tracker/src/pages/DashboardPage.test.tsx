import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StaffRole } from '../types/auth'
import { DashboardPage } from './DashboardPage'

let currentRole: StaffRole = 'hr_recruiter'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'staff-1', full_name: 'Alex Staff', email: 'alex@example.com', role: currentRole, is_active: true } }),
}))

const loadDashboardData = vi.fn()
vi.mock('../services/dashboard', () => ({ loadDashboardData: (...args: unknown[]) => loadDashboardData(...args) }))

const emptyData = { positions: [], candidates: [], interviews: [], decisions: [], staff: [] }

describe('DashboardPage role views', () => {
  beforeEach(() => loadDashboardData.mockResolvedValue(emptyData))

  it.each([
    ['hr_recruiter', 'Items needing attention'],
    ['it_admin', 'Access and operational health'],
    ['interviewer', 'Manage your calendar'],
    ['hiring_manager', 'Recommendation status'],
    ['management_user', 'Recruitment outcomes'],
  ] as const)('shows the correct %s overview', async (role, expectedText) => {
    currentRole = role
    render(<DashboardPage />)
    expect(await screen.findByText(expectedText)).toBeInTheDocument()
    expect(loadDashboardData).toHaveBeenCalledWith(role)
  })
})
