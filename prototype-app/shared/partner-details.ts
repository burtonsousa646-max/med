export const registryFields = {
  legalName: 'Полное наименование',
  kpp: 'КПП',
  ogrn: 'ОГРН / ОГРНИП',
  legalAddress: 'Адрес по реестру',
  manager: 'Руководитель по реестру',
  managerRole: 'Должность руководителя',
  okved: 'Основной ОКВЭД',
} as const

export type RegistryDetails = Record<keyof typeof registryFields, string> & {
  taxSystem?:string
  checkedAt: number
  requiresReview: boolean
}

export const partnerFields = {
  legalName: { label: 'Полное наименование', length: 500 },
  kpp: { label: 'КПП', length: 9, digits: true },
  ogrn: { label: 'ОГРН / ОГРНИП', length: 15, digits: true },
  legalAddress: { label: 'Юридический адрес / адрес регистрации', length: 500 },
  signer: { label: 'ФИО подписанта', length: 150 },
  signerRole: { label: 'Должность подписанта', length: 150 },
  signerAuthority: { label: 'Основание полномочий (устав, доверенность)', length: 200 },
  bank: { label: 'Банк', length: 150 },
  bik: { label: 'БИК', length: 9, digits: true },
  account: { label: 'Расчётный счёт', length: 20, digits: true },
  correspondentAccount: { label: 'Корреспондентский счёт', length: 20, digits: true },
  taxSystem: { label: 'Система налогообложения', length: 100 },
} as const

export type PartnerDetails = Partial<Record<keyof typeof partnerFields, string>>
export const partnerFieldKeys = Object.keys(partnerFields) as (keyof PartnerDetails)[]

export function parsePartnerDetails(value: unknown, inn: string): PartnerDetails | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid partner details')

  const details: PartnerDetails = {}
  for (const key of partnerFieldKeys) {
    const raw = (value as Record<string, unknown>)[key]
    if (raw === undefined) continue
    const field = partnerFields[key]
    if (typeof raw !== 'string' || raw.length > field.length || /[\u0000-\u001f\u007f]/.test(raw)) throw new Error('Invalid partner field')
    const text = raw.trim()
    if (!text) continue
    if ('digits' in field && (!/^\d+$/.test(text) || text.length !== (key === 'ogrn' && inn.length === 10 ? 13 : field.length))) {
      throw new Error('Invalid partner number')
    }
    if (key !== 'kpp' || inn.length === 10) details[key] = text
  }
  return Object.keys(details).length ? details : undefined
}

export function providedDetailsRows(inn: string, registry?: RegistryDetails | null, provided?: PartnerDetails): [string, string][] {
  return partnerFieldKeys.filter(key => {
    if (key === 'kpp' && inn.length === 12) return false
    return !Object.hasOwn(registryFields, key) || Boolean(provided?.[key]) || !registry?.[key as keyof typeof registryFields]
  }).map(key => [`Со слов партнёра · ${partnerFields[key].label}`, provided?.[key] || 'Не указано'])
}

export function partnerDetailsRows(inn: string, registry?: RegistryDetails | null, provided?: PartnerDetails): [string, string][] {
  const entrepreneur = inn.length === 12
  return [
    ['Данные DaData', registry
      ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(registry.checkedAt) + ' МСК'
        + (registry.requiresReview ? ' · требуется проверка' : '')
      : 'Нет снимка реестра. Требуется проверка'],
    ...Object.entries(registryFields).filter(([key]) => !entrepreneur || !['kpp', 'manager', 'managerRole'].includes(key))
      .map(([key, label]): [string, string] => [label, registry?.[key as keyof typeof registryFields] || 'Нет данных']),
    ...providedDetailsRows(inn, registry, provided),
  ]
}
