import { expect, it } from 'vitest'
import { mapDadata } from './dadata.mapper.ts'
import { DadataAdapter } from './dadata-cloud.adapter.ts'
import { StubSuggestionAdapter, OnPremStubTransport } from '../stub'

import { SuggestionQuery } from '../../domain/suggestion'

// Проверки границы источника: только разрешённые поля DaData становятся моделью платформы.
// У ИП нет КПП в результате; вложенный адрес и статус приводятся к модели сервиса.
it('R1.1–R1.2: выдаёт реквизиты и не добавляет КПП ИП', () => {
  const items = mapDadata('party', {
    suggestions: [
      {
        value: 'ИП Пример',
        data: {
          type: 'INDIVIDUAL',
          inn: '000000000000',
          kpp: '000000000',
          ogrn: '000000000000000',
          address: { unrestricted_value: 'г Пример' },
          state: { status: 'ACTIVE' },
        },
      },
    ],
  })
  expect(items).toEqual([
    {
      value: 'ИП Пример',
      inn: '000000000000',
      ogrn: '000000000000000',
      address: 'г Пример',
      status: 'active',
    },
  ])
})

// Полный адрес приоритетнее краткого, а координаты 0,0 являются корректными.
it('R2: маппит полный адрес, части и нулевые координаты', () => {
  expect(
    mapDadata('address', {
      suggestions: [
        {
          value: 'Короткий',
          unrestricted_value: 'Полный адрес',
          data: {
            region_with_type: 'Тестовый регион',
            area_with_type: 'р-н Пример',
            city_with_type: 'г Пример',
            house: '1',
            block_type: 'корп',
            block: '2',
            geo_lat: '0',
            geo_lon: '0',
          },
        },
      ],
    }),
  ).toEqual([
    {
      value: 'Полный адрес',
      region: 'Тестовый регион',
      district: 'р-н Пример',
      city: 'г Пример',
      house: '1',
      block: 'корп 2',
      coordinates: { latitude: 0, longitude: 0 },
    },
  ])
  expect(
    mapDadata('address', {
      suggestions: [
        { value: 'г Пример', data: { postal_code: null, geo_lat: '0', geo_lon: null } },
      ],
    }),
  ).toEqual([{ value: 'г Пример' }])
})

// Банк и email используют свои белые списки и не раскрывают дополнительные поля источника.
it('R3–R4: маппит банк и email без исходного envelope', () => {
  expect(
    mapDadata('bank', {
      suggestions: [
        {
          value: 'Банк Пример',
          data: {
            bic: '000000000',
            correspondent_account: '00000000000000000000',
            address: { value: 'г Пример' },
            secret: 'synthetic',
          },
        },
      ],
    }),
  ).toEqual([
    {
      value: 'Банк Пример',
      bic: '000000000',
      correspondentAccount: '00000000000000000000',
      address: 'г Пример',
    },
  ])
  expect(
    mapDadata('email', {
      suggestions: [{ value: 'qa@example.test', data: { domain: 'example.test' } }],
    }),
  ).toEqual([{ value: 'qa@example.test' }])
})

// Пустая выдача — успешный результат; отсутствующий envelope или display — ошибка протокола.
it('R1.3/R9.1: различает отсутствие вариантов и неверный протокол', () => {
  expect(mapDadata('party', { suggestions: [] })).toEqual([])
  expect(() => mapDadata('party', {})).toThrow()
  expect(() => mapDadata('party', { suggestions: [{ value: '' }] })).toThrow()
})

// Обе локальные конфигурации должны давать одинаковые модели на синтетических запросах.
it('R7.2–R7.3: обе заглушки поддерживают четыре вида без внешней сети', async () => {
  const stub = new StubSuggestionAdapter()
  const onprem = new DadataAdapter('dadata-onprem-stub', new OnPremStubTransport())
  const signal = new AbortController().signal
  for (const [kind, query] of [
    ['party', 'пример'],
    ['address', 'пример'],
    ['bank', 'пример'],
    ['email', 'example'],
  ] as const) {
    const search = new SuggestionQuery(kind, query)
    expect(await onprem.suggest(search, signal)).toEqual(await stub.suggest(search, signal))
  }
  expect(await stub.suggest(new SuggestionQuery('party', 'нет-совпадений'), signal)).toEqual([])
})
