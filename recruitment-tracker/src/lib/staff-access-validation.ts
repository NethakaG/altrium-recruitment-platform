import { isStaffRole, type StaffRole } from '../types/auth'

export interface StaffAccessErrors {
  email?: string
  fullName?: string
  role?: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateStaffAccess(fullName: string, role: StaffRole | ''): StaffAccessErrors {
  const errors: StaffAccessErrors = {}
  const name = fullName.trim()
  if (name.length < 2 || name.length > 120) errors.fullName = 'Enter a full name between 2 and 120 characters.'
  if (!isStaffRole(role)) errors.role = 'Select a staff role.'
  return errors
}

export function validateStaffInvite(email: string, fullName: string, role: StaffRole | ''): StaffAccessErrors {
  const errors = validateStaffAccess(fullName, role)
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.'
  return errors
}

export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return 'Include an uppercase letter, lowercase letter and number.'
  }
  if (password !== confirmation) return 'The passwords do not match.'
  return null
}
