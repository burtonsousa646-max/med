// Клиент API для микрофронтендов — ai/rules/frontend.md, раздел «Данные с сервера».
// Типы генерируются в src/generated/ командой `pnpm --filter @platform/api generate`.
// Клиент для каждого API (cabinet, backoffice, public) добавляется сюда вместе с его первым контрактом:
//   export const cabinetApi = createApi<CabinetPaths>()
export { createApi, DEFAULT_BASE_URL, unwrap, type ApiResult } from './client'
export { ApiRequestError, isApiRequestError, toApiError, type ApiError } from './errors'
