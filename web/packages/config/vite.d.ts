import type { UserConfig } from 'vite'

export interface AppConfigOptions {
  /** Имя приложения в Module Federation, например `shell` или `cabinet`. */
  name: string
  /** Порт dev-сервера. */
  port: number
  /** Модули, которые отдаёт микрофронтенд. */
  exposes?: Record<string, string>
  /** Микрофронтенды, которые подключает хост. */
  remotes?: Record<string, string>
  /** Дополнительные настройки приложения. */
  overrides?: UserConfig
}

export function defineAppConfig(options: AppConfigOptions): UserConfig
