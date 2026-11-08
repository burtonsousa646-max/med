import createClient, { type Client, type ClientOptions } from 'openapi-fetch'

import { ApiRequestError, toApiError } from './errors'

/** Адрес API Gateway по умолчанию: тот же домен, что и у frontend. */
export const DEFAULT_BASE_URL = '/api'

/**
 * Создаёт клиент для одного API по типам, сгенерированным из api/openapi/<name>.yaml.
 * Сессия передаётся cookie, поэтому запросы всегда идут с `credentials: 'include'`.
 *
 * @example
 * import type { paths } from './generated/cabinet'
 * export const cabinetApi = createApi<paths>()
 */
export function createApi<Paths extends object>(options: ClientOptions = {}): Client<Paths> {
  return createClient<Paths>({ baseUrl: DEFAULT_BASE_URL, ...options, credentials: 'include' })
}

/** Результат вызова метода клиента openapi-fetch. */
export interface ApiResult<Data> {
  data?: Data
  error?: unknown
  response: Response
}

/**
 * Возвращает данные успешного ответа, а ошибку превращает в `ApiRequestError`.
 * Используется в `queryFn` и `mutationFn` — ai/rules/frontend.md, раздел «Данные с сервера».
 *
 * @example
 * queryFn: async ({ signal }) =>
 *   unwrap(await cabinetApi.GET('/v1/campaigns/{campaignId}', { params: { path: { campaignId } }, signal }))
 */
export function unwrap<Data>(result: ApiResult<Data>): Data {
  if (result.error !== undefined || !result.response.ok) {
    throw new ApiRequestError(result.response.status, toApiError(result.error))
  }
  return result.data as Data
}
