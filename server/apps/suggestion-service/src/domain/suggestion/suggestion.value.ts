import type { SuggestionByKind } from './suggestion.value.types.ts'

// Собственные модели подсказок и проверка данных на границе источника и кеша.
import type { SuggestionKind } from './suggestion-query.value.types.ts'
import { SourceUnavailableError } from './suggestion.errors.ts'

/**
 * Читает неизвестное значение как объект полей; null, массивы и примитивы отклоняет.
 */
export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * Допустимая текстовая часть подсказки: непустая строка до 4096 кодовых точек.
 */
const stringValue = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && Array.from(value).length <= 4096

/**
 * Проверки формата реквизитов и составных полей; контрольные суммы здесь не вычисляются.
 */
const checks: Record<string, (value: unknown) => boolean> = {
  inn: (value) => typeof value === 'string' && /^(?:[0-9]{10}|[0-9]{12})$/.test(value),
  kpp: (value) => typeof value === 'string' && /^[0-9]{9}$/.test(value),
  ogrn: (value) => typeof value === 'string' && /^(?:[0-9]{13}|[0-9]{15})$/.test(value),
  bic: (value) => typeof value === 'string' && /^[0-9]{9}$/.test(value),
  correspondentAccount: (value) => typeof value === 'string' && /^[0-9]{20}$/.test(value),
  postalCode: (value) => typeof value === 'string' && /^[0-9]{6}$/.test(value),
  fiasId: (value) =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  status: (value) =>
    typeof value === 'string' &&
    ['active', 'liquidating', 'liquidated', 'reorganizing', 'bankrupt', 'unknown'].includes(value),
  coordinates: isCoordinates,
}

/**
 * Белый список полей каждой модели: исходные поля провайдера в результат не попадают.
 */
const fields: Record<SuggestionKind, readonly string[]> = {
  party: ['value', 'inn', 'kpp', 'ogrn', 'address', 'status'],
  address: [
    'value',
    'region',
    'district',
    'city',
    'settlement',
    'street',
    'house',
    'block',
    'flat',
    'postalCode',
    'fiasId',
    'coordinates',
  ],
  bank: ['value', 'bic', 'correspondentAccount', 'address'],
  email: ['value'],
}

/**
 * Строит модель с обязательным непустым value и разрешёнными полями выбранного вида.
 * В обычном режиме неизвестные и неверные необязательные поля опускаются.
 * В строгом режиме кеша любое такое поле делает запись непригодной целиком.
 * Возвращаемый объект заморожен поверхностно.
 * @param strict Включает строгую проверку уже нормализованной записи из кеша.
 * @throws SourceUnavailableError При нарушении формата обязательного поля или строгой проверки.
 */
export function sanitize<K extends SuggestionKind>(
  kind: K,
  input: unknown,
  strict = false,
): SuggestionByKind[K] {
  const data = record(input)
  if (!data || !stringValue(data['value'])) throw new SourceUnavailableError('protocol')

  const suggestion: Record<string, unknown> = { value: data['value'] }

  for (const [key, value] of Object.entries(data)) {
    if (key === 'value') continue
    if (!fields[kind].includes(key)) {
      if (strict) throw new SourceUnavailableError('protocol')
      continue
    }

    const valid = (checks[key] ?? stringValue)(value)
    if (valid) suggestion[key] = value
    else if (strict) throw new SourceUnavailableError('protocol')
  }

  return Object.freeze(suggestion) as unknown as SuggestionByKind[K]
}

/**
 * Проверяет диапазоны координат и отсутствие лишних полей в объекте точки.
 */
function isCoordinates(value: unknown): boolean {
  const point = record(value)
  if (!point) return false

  const latitude = point['latitude']
  const longitude = point['longitude']

  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180 &&
    Object.keys(point).every((key) => ['latitude', 'longitude'].includes(key))
  )
}
