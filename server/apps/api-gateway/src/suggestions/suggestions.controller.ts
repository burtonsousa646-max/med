import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { SuggestionGrpcClient } from '../clients/suggestion'
import { RequestContexts } from '../context.ts'
import { GatewayError } from '../errors.ts'
const fields = {
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
} as const

/** Оставляет только поля ответа, разрешённые для вида подсказок. */
function mapItems(kind: keyof typeof fields, items: unknown): Record<string, unknown>[] {
  if (!Array.isArray(items)) throw new GatewayError(503)
  return items.slice(0, 10).map((input: unknown) => {
    if (
      input === null ||
      typeof input !== 'object' ||
      !('value' in input) ||
      typeof input.value !== 'string' ||
      !input.value
    )
      throw new GatewayError(503)
    const item = input as Record<string, unknown>
    const out: Record<string, unknown> = { value: input.value }
    for (const name of fields[kind]) {
      if (name === 'value') continue
      const value = item[name]
      if (typeof value === 'string' && value) out[name] = value
      if (name === 'coordinates' && value !== null && typeof value === 'object') {
        const point = value as Record<string, unknown>
        if (
          typeof point['latitude'] === 'number' &&
          Number.isFinite(point['latitude']) &&
          Math.abs(point['latitude']) <= 90 &&
          typeof point['longitude'] === 'number' &&
          Number.isFinite(point['longitude']) &&
          Math.abs(point['longitude']) <= 180
        )
          out[name] = { latitude: point['latitude'], longitude: point['longitude'] }
      }
    }
    return out
  })
}

/** Создаёт HTTP-контроллер подсказок для приложения. */
export function createSuggestionsController(appId: string) {
  @Controller(appId === 'platform' ? '/api' : `/api/${appId}`)
  /** Предоставляет операции подсказок выбранного приложения через gRPC-клиент. */
  class SuggestionsController {
    /** Получает зависимости и настройки компонента. */
    constructor(
      private readonly client: SuggestionGrpcClient,
      private readonly contexts: RequestContexts,
    ) {}

    /** Запрашивает варианты организаций и ИП. */
    @Post('/v1/suggestions/parties')
    @HttpCode(200)
    async suggestParties(@Body() body: { query: string }, @Req() req: Request) {
      return {
        items: mapItems(
          'party',
          (await this.client.suggestParties(body.query.trim(), this.contexts.get(req))).items,
        ),
      }
    }

    /** Запрашивает варианты адресов. */
    @Post('/v1/suggestions/addresses')
    @HttpCode(200)
    async suggestAddresses(@Body() body: { query: string }, @Req() req: Request) {
      return {
        items: mapItems(
          'address',
          (await this.client.suggestAddresses(body.query.trim(), this.contexts.get(req))).items,
        ),
      }
    }

    /** Запрашивает варианты банков. */
    @Post('/v1/suggestions/banks')
    @HttpCode(200)
    async suggestBanks(@Body() body: { query: string }, @Req() req: Request) {
      return {
        items: mapItems(
          'bank',
          (await this.client.suggestBanks(body.query.trim(), this.contexts.get(req))).items,
        ),
      }
    }

    /** Запрашивает варианты электронной почты. */
    @Post('/v1/suggestions/emails')
    @HttpCode(200)
    async suggestEmails(@Body() body: { query: string }, @Req() req: Request) {
      return {
        items: mapItems(
          'email',
          (await this.client.suggestEmails(body.query.trim(), this.contexts.get(req))).items,
        ),
      }
    }
  }
  return SuggestionsController
}
