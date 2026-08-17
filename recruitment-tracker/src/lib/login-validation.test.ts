import { describe, expect, it } from 'vitest'
import { validateLogin } from './login-validation'

describe('validateLogin', () => {
  it('requires both credentials', () => {
    expect(validateLogin('', '')).toEqual({ email: 'Work email is required.', password: 'Password is required.' })
  })

  it('rejects malformed email addresses', () => {
    expect(validateLogin('not-an-email', 'password')).toEqual({ email: 'Enter a valid work email.' })
  })

  it('accepts a complete login', () => {
    expect(validateLogin('hr@altrium.com', 'password')).toEqual({})
  })
})
