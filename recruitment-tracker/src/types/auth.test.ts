import { describe, expect, it } from 'vitest'
import { canAccessPath, canManageCandidates, canManagePositions, candidateBasePath, roleDefinitions, staffRoles } from './auth'

describe('staff role access', () => {
  it('defines exactly the five confirmed roles', () => {
    expect(staffRoles).toEqual(['it_admin', 'hr_recruiter', 'interviewer', 'hiring_manager', 'management_user'])
  })

  it('gives HR access to recruitment modules', () => {
    expect(canAccessPath('hr_recruiter', '/positions')).toBe(true)
    expect(canAccessPath('hr_recruiter', '/screening')).toBe(true)
  })

  it('allows every active role to view position routes', () => {
    for (const role of staffRoles) expect(canAccessPath(role, '/positions/example-id')).toBe(true)
    for (const role of staffRoles) expect(canAccessPath(role, '/workflows/example-id')).toBe(true)
  })

  it('limits position management to IT Admin and HR', () => {
    expect(canManagePositions('it_admin')).toBe(true)
    expect(canManagePositions('hr_recruiter')).toBe(true)
    expect(canManagePositions('interviewer')).toBe(false)
    expect(canManagePositions('hiring_manager')).toBe(false)
    expect(canManagePositions('management_user')).toBe(false)
    expect(roleDefinitions.management_user.routes).toEqual(['/', '/positions', '/workflows', '/overview'])
  })

  it('maps each role to its candidate workspace and limits candidate changes', () => {
    expect(candidateBasePath('it_admin')).toBe('/candidates')
    expect(candidateBasePath('hr_recruiter')).toBe('/candidates')
    expect(candidateBasePath('interviewer')).toBe('/assignments')
    expect(candidateBasePath('hiring_manager')).toBe('/candidate-review')
    expect(candidateBasePath('management_user')).toBe('/overview')
    expect(canManageCandidates('it_admin')).toBe(true)
    expect(canManageCandidates('hr_recruiter')).toBe(true)
    expect(canManageCandidates('interviewer')).toBe(false)
  })

  it('keeps staff administration exclusive to IT Admin', () => {
    expect(canAccessPath('it_admin', '/staff-access')).toBe(true)
    expect(canAccessPath('hr_recruiter', '/staff-access')).toBe(false)
  })
})
