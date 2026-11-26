import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { EncryptedCodes } from './code-protection.ts'
import { normalizeEmail } from '../domain'

describe('Защита проверочного кода', () => {
  it('связывает шифротекст с адресом и восстанавливает шесть цифр', () => {
    const protection = new EncryptedCodes(randomBytes(32))
    const email = 'person@example.test'
    const sealed = protection.issue(email)
    const code = protection.open(email, sealed).toString('ascii')
    expect(code).toMatch(/^\d{6}$/)
    expect(protection.matches(email, sealed, code)).toBe(true)
    expect(() => protection.open('other@example.test', sealed)).toThrow()
  })

  it('распознаёт регистр и отклоняет неверный адрес', () => {
    expect(normalizeEmail('Person@Example.TEST')).toBe('person@example.test')
    expect(normalizeEmail(' ')).toBeUndefined()
  })
})
