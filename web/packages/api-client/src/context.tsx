import { createContext, use, type ReactNode } from 'react'
import type { Client } from 'openapi-fetch'

// Один контекст на всю страницу: пакет загружается в одном экземпляре для host и всех module
// (список общих библиотек — в пресете @platform/web-config/vite).
const ApiContext = createContext<Client<object> | null>(null)

export interface ApiProviderProps<Paths extends object> {
  /** Единственный экземпляр клиента web-приложения — создаётся в host. */
  client: Client<Paths>
  children: ReactNode
}

/** Передаёт клиент API от host всем module приложения. Подключается только в host. */
export function ApiProvider<Paths extends object>({ client, children }: ApiProviderProps<Paths>) {
  return <ApiContext value={client}>{children}</ApiContext>
}

/**
 * Клиент API web-приложения, созданный host. Типизируется путями OpenAPI приложения:
 * `useApi<paths>()`, где `paths` — из `@platform/api-client/generated/<app>`.
 */
export function useApi<Paths extends object>(): Client<Paths> {
  const client = use(ApiContext)
  if (!client) {
    throw new Error('Клиент API не передан: host должен подключить ApiProvider выше по дереву')
  }
  return client
}
