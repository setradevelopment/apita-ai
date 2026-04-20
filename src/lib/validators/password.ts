/**
 * Password policy — single source of truth.
 *
 * Rules (applied to every user-picked password across the app — signup,
 * voluntary change via settings, forced change after admin-initiated reset):
 *   - min 6 characters
 *   - at least 1 lowercase letter
 *   - at least 1 uppercase letter
 *   - at least 1 digit
 *   - at least 1 special character (non-alphanumeric)
 *
 * Generated temp passwords (e.g. `{cpf4}@{org-slug}`) do NOT need to pass
 * this rule — they're immediately replaced via the forced-change flow on
 * first login, and that replacement IS validated.
 */

export const PASSWORD_MIN_LENGTH = 6

export interface PasswordCheck {
  length: boolean
  lowercase: boolean
  uppercase: boolean
  digit: boolean
  special: boolean
}

export function checkPasswordRules(password: string): PasswordCheck {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
    // Anything not letter/number and not whitespace counts as special.
    special: /[^A-Za-z0-9\s]/.test(password),
  }
}

export function isStrongPassword(password: string): boolean {
  const c = checkPasswordRules(password)
  return c.length && c.lowercase && c.uppercase && c.digit && c.special
}

/**
 * Returns a human-readable PT-BR error message listing the first failing
 * rule, or null if the password meets all rules.
 */
export function getPasswordError(password: string): string | null {
  const c = checkPasswordRules(password)
  if (!c.length) return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`
  if (!c.lowercase) return 'A senha deve conter pelo menos 1 letra minúscula.'
  if (!c.uppercase) return 'A senha deve conter pelo menos 1 letra maiúscula.'
  if (!c.digit) return 'A senha deve conter pelo menos 1 número.'
  if (!c.special) return 'A senha deve conter pelo menos 1 caractere especial (!@#$%&* etc.).'
  return null
}
