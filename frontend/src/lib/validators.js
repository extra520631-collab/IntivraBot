// Lightweight, dependency-free form validators shared across auth pages.

export const isEmail = (v = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export function validateLogin({ email, password }) {
  const errors = {}
  if (!email) errors.email = 'Email is required.'
  else if (!isEmail(email)) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Password is required.'
  return errors
}

export function validateRegister({ name, email, password, agree }) {
  const errors = {}
  if (!name || name.trim().length < 2) errors.name = 'Please enter your full name.'
  if (!email) errors.email = 'Email is required.'
  else if (!isEmail(email)) errors.email = 'Enter a valid email address.'
  if (!password) errors.password = 'Password is required.'
  else if (password.length < 8) errors.password = 'Use at least 8 characters.'
  if (!agree) errors.agree = 'You must accept the terms to continue.'
  return errors
}
