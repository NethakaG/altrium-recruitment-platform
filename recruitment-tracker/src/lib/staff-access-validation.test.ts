import { describe, expect, it } from 'vitest'
import { validateNewPassword, validateStaffAccess, validateStaffInvite } from './staff-access-validation'

describe('staff access validation', () => {
  it('accepts a complete staff invitation', () => {
    expect(validateStaffInvite('person@example.com', 'Example Person', 'interviewer')).toEqual({})
  })

  it('rejects invalid staff invitation details', () => {
    expect(validateStaffInvite('not-an-email', 'A', '' as never)).toEqual({
      email: 'Enter a valid email address.',
      fullName: 'Enter a full name between 2 and 120 characters.',
      role: 'Select a staff role.',
    })
  })

  it('validates account edits without requiring an email', () => {
    expect(validateStaffAccess('Altrium Admin', 'it_admin')).toEqual({})
  })
})

describe('invitation password validation', () => {
  it('requires a strong matching password', () => {
    expect(validateNewPassword('short', 'short')).toBe('Use at least 8 characters.')
    expect(validateNewPassword('alllowercase1', 'alllowercase1')).toBe('Include an uppercase letter, lowercase letter and number.')
    expect(validateNewPassword('StrongPass1', 'StrongPass2')).toBe('The passwords do not match.')
    expect(validateNewPassword('StrongPass1', 'StrongPass1')).toBeNull()
  })
})
