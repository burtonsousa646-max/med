/** Решения принимаются по серверному времени после получения блокировки адреса. */
export const CODE_LIFETIME_MS = 600_000
export const RESEND_INTERVAL_MS = 60_000
export const MAX_ATTEMPTS = 5

/** Сравнение и поиск для обоих шагов используют одну форму адреса. */
export function normalizeEmail(input: string): string | undefined {
  if (input.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input)) return undefined
  return input.toLowerCase()
}
