import type { SourceFields } from './dadata.mapper.types.ts'

// Поля DaData преобразуются в собственные модели; исходный data наружу не передаётся.
import {
  type SuggestionKind,
  record,
  sanitize,
  type Suggestion,
  SourceUnavailableError,
} from '../../domain/suggestion'

const ADDRESS_FIELDS = {
  region: 'region_with_type',
  district: 'area_with_type',
  city: 'city_with_type',
  settlement: 'settlement_with_type',
  street: 'street_with_type',
  house: 'house',
  postalCode: 'postal_code',
  fiasId: 'fias_id',
} as const

const KNOWN_PARTY_STATUSES = ['ACTIVE', 'LIQUIDATING', 'LIQUIDATED', 'REORGANIZING', 'BANKRUPT']

/**
 * Проверяет envelope DaData и переводит первые десять вариантов в модели платформы.
 * Порядок сохраняется; для адреса предпочтителен unrestricted_value.
 * @throws SourceUnavailableError При неверном envelope или обязательном значении подсказки.
 */
export function mapDadata(kind: SuggestionKind, input: unknown): Suggestion[] {
  const envelope = record(input)
  const items = envelope?.['suggestions']
  if (!Array.isArray(items)) throw new SourceUnavailableError('protocol')

  return items.slice(0, 10).map((raw: unknown) => {
    const item = record(raw)
    const data = record(item?.['data']) ?? {}
    const value =
      kind === 'address' ? item?.['unrestricted_value'] || item?.['value'] : item?.['value']

    const fields = mapFields(kind, data)

    return sanitize(kind, { value, ...fields })
  })
}

/**
 * Выбирает преобразование полей data по справочнику; email использует только отображаемое значение.
 */
function mapFields(kind: SuggestionKind, data: SourceFields): SourceFields {
  switch (kind) {
    case 'party':
      return mapPartyFields(data)
    case 'address':
      return mapAddressFields(data)
    case 'bank':
      return mapBankFields(data)
    case 'email':
      return {}
  }
}

/**
 * Сопоставляет реквизиты организации или ИП: у ИП опускает КПП,
 * неизвестный непустой статус переводит в unknown; форматы затем проверяет домен.
 */
function mapPartyFields(data: SourceFields): SourceFields {
  const fields: SourceFields = {
    inn: data['inn'],
    ogrn: data['ogrn'],
    address: readFullAddress(data['address']),
  }

  if (data['type'] !== 'INDIVIDUAL') {
    fields['kpp'] = data['kpp']
  }

  const sourceStatus = record(data['state'])?.['status']
  if (typeof sourceStatus === 'string' && sourceStatus) {
    fields['status'] = KNOWN_PARTY_STATUSES.includes(sourceStatus)
      ? sourceStatus.toLowerCase()
      : 'unknown'
  }

  return fields
}

/**
 * Сопоставляет части адреса и преобразует строковые координаты в числа.
 * Допустимость диапазонов и форматов проверяется при построении доменной модели.
 */
function mapAddressFields(data: SourceFields): SourceFields {
  const fields: SourceFields = {}
  for (const [target, source] of Object.entries(ADDRESS_FIELDS)) {
    fields[target] = data[source]
  }

  fields['block'] = formatAddressPart(data['block_type'], data['block'])
  fields['flat'] = formatAddressPart(data['flat_type'], data['flat'])

  const latitude = data['geo_lat']
  const longitude = data['geo_lon']
  if (
    typeof latitude === 'string' &&
    latitude.trim() &&
    typeof longitude === 'string' &&
    longitude.trim()
  ) {
    fields['coordinates'] = { latitude: Number(latitude), longitude: Number(longitude) }
  }

  return fields
}

/**
 * Извлекает БИК, корреспондентский счёт и адрес; прочие данные банка не переносит.
 */
function mapBankFields(data: SourceFields): SourceFields {
  return {
    bic: data['bic'],
    correspondentAccount: data['correspondent_account'],
    address: readFullAddress(data['address']),
  }
}

/**
 * Выбирает полный адрес из вложенного объекта, затем обычный; тип проверяется доменом.
 */
function readFullAddress(input: unknown): unknown {
  const address = record(input)
  return address?.['unrestricted_value'] || address?.['value']
}

/**
 * Соединяет тип и номер корпуса или квартиры; без строкового номера возвращает undefined.
 */
function formatAddressPart(type: unknown, value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  return [typeof type === 'string' ? type : '', value].filter(Boolean).join(' ')
}
