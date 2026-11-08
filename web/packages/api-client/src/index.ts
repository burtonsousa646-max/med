// Клиент API для web-приложений — ai/rules/frontend.md, раздел «Данные с сервера».
//
// У каждого web-приложения свой файл OpenAPI и один экземпляр клиента:
// - host создаёт клиент: createApi<paths>() и передаёт его через <ApiProvider client={api}>;
// - module получает его: useApi<paths>().
// Типы генерируются в src/generated/<app>.ts командой `pnpm --filter @platform/api generate`
// и импортируются так: import type { paths } from '@platform/api-client/generated/<app>'.
export { createApi, DEFAULT_BASE_URL, unwrap, type ApiResult } from './client'
export { ApiProvider, useApi, type ApiProviderProps } from './context'
export { ApiRequestError, isApiRequestError, toApiError, type ApiError } from './errors'
export type { Client } from 'openapi-fetch'
