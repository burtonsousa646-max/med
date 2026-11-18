import { expect, it } from 'vitest'
import { SuggestionQuery } from './suggestion-query.value.ts'
import { sanitize } from './suggestion.value.ts'

// Проверки доменных инвариантов после нормализации недоверенного ввода.
/** Значения короче минимума пусты; пробелы по краям удаляются. */
it.each([
  ['', true],
  [' ', true],
  ['а', true],
  ['аб', true],
  [' абв ', false],
])('R5: нормализует строку %s', (value, empty) => {
  const query = new SuggestionQuery('party', value)
  expect(query.empty).toBe(empty)
  expect(query.value).toBe(value.trim())
})

// Длина измеряется кодовыми точками Unicode, а внутренние пробелы остаются частью запроса.
it('R5.6–R5.7: считает кодовые точки и сохраняет внутренние пробелы', () => {
  expect(new SuggestionQuery('address', ' ' + '😀'.repeat(150) + ' ').length).toBe(150)
  expect(() => new SuggestionQuery('address', '😀'.repeat(151))).toThrow()
  expect(new SuggestionQuery('address', '  г Пример  ').value).toBe('г Пример')
  expect(() => new SuggestionQuery('party', {})).toThrow()
})

// Обязательный display и белый список проверяются отдельно для источника и кеша.
it('R1–R4: запрещает пустой display и опускает неверные необязательные сведения', () => {
  expect(() => sanitize('party', { value: '' })).toThrow()
  expect(
    sanitize('party', {
      value: 'ИП Пример',
      kpp: null,
      inn: '000000000000',
      password: 'synthetic',
    }),
  ).toEqual({ value: 'ИП Пример', inn: '000000000000' })
  expect(() => sanitize('party', { value: 'ИП Пример', password: 'synthetic' }, true)).toThrow()
  expect(
    sanitize('address', { value: 'г Пример', coordinates: { latitude: 0, longitude: 0 } }),
  ).toEqual({ value: 'г Пример', coordinates: { latitude: 0, longitude: 0 } })
  expect(
    sanitize('address', { value: 'г Пример', coordinates: { latitude: 100, longitude: 0 } }),
  ).toEqual({ value: 'г Пример' })
})
