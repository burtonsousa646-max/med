/** Контрольная сумма ИНН РФ: 10 цифр — юрлицо, 12 цифр — ИП/физлицо. */
export function isValidInn(raw: string): boolean {
  const value = raw.trim()
  if (!/^\d{10}$/.test(value) && !/^\d{12}$/.test(value)) return false
  const digits = value.split('').map(Number)

  if (digits.length === 10) {
    const w = [2, 4, 10, 3, 5, 9, 4, 6, 8]
    const control = dot(w, digits.slice(0, 9)) % 11 % 10
    return control === digits[9]
  }

  const w11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8, 0]
  const w12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
  const control11 = dot(w11, digits.slice(0, 11)) % 11 % 10
  const control12 = dot(w12, digits.slice(0, 11)) % 11 % 10
  return control11 === digits[10] && control12 === digits[11]
}

function dot(weights: number[], digits: number[]): number {
  return weights.reduce((sum, w, i) => sum + w * digits[i], 0)
}

/** Для демо подходит любой ИНН нужной длины: 10 цифр у ООО/АО, 12 — у ИП. Контрольная сумма
 *  (isValidInn) проверяется отдельно и в форме не требуется. */
export function isInnShapeValid(raw: string, legalForm: 'ООО' | 'АО' | 'ИП'): boolean {
  return new RegExp(`^\\d{${legalForm === 'ИП' ? 12 : 10}}$`).test(raw.trim())
}

/** Длина ОГРН зависит от юрформы: 13 цифр для ООО/АО, 15 — для ИП (ОГРНИП). */
export function isValidOgrn(raw: string, legalForm: 'ООО' | 'АО' | 'ИП'): boolean {
  const value = raw.trim()
  const expectedLength = legalForm === 'ИП' ? 15 : 13
  return new RegExp(`^\\d{${expectedLength}}$`).test(value)
}

export function innLabelFor(legalForm: 'ООО' | 'АО' | 'ИП'): string {
  return legalForm === 'ИП' ? 'ИНН (12 цифр)' : 'ИНН (10 цифр)'
}
