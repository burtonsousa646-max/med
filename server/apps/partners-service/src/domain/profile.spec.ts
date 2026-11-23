import { describe, it, expect } from 'vitest'
import { checkedId, registrationEmail } from './profile.ts'

describe('Входные данные регистрации', () => {
  it('нормализует регистр подтверждённого адреса', () => {
    expect(registrationEmail('Person@Example.TEST')).toBe('person@example.test')
  })

  it.each(['', 'person', 'one two@example.test'])('отклоняет некорректный email', (address) => {
    expect(() => registrationEmail(address)).toThrow('invalid_input')
  })

  it('отклоняет пустой ключ регистрации', () => {
    expect(() => checkedId('')).toThrow('invalid_input')
  })
})
