export interface LoginErrors {
  email?: string
  password?: string
}

export function validateLogin(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {}
  const trimmedEmail = email.trim()

  if (!trimmedEmail) {
    errors.email = 'Work email is required.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = 'Enter a valid work email.'
  }

  if (!password) errors.password = 'Password is required.'
  return errors
}
