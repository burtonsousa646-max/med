/** Переменные окружения без изменения исходного объекта. */
export type Env = Readonly<Record<string, string | undefined>>

/** Проверенная конфигурация API Gateway. */
export type GatewayConfig = ReturnType<typeof import('./config.ts').readGatewayConfig>

/** Проверенная конфигурация сервиса подсказок. */
export type SuggestionConfig = ReturnType<typeof import('./config.ts').readSuggestionConfig>

/** Проверенные настройки подсказок Gateway. */
export type GatewaySuggestionConfig = NonNullable<GatewayConfig['suggestions']>

/** Настройки собственной базы и шифрования кодов входа. */
export type AuthConfig = ReturnType<typeof import('./config.ts').readAuthConfig>
