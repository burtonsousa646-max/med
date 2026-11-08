import type { UserConfig } from 'vite'

export interface AppConfigOptions {
  /** Имя сборки в Module Federation: `<app>_host` или `<app>_<module>`, например `cabinet_host`. */
  name: string
  /** Порт dev-сервера. */
  port: number
  /** Что отдаёт module, например корневой компонент. */
  exposes?: Record<string, string>
  /** Module, которые загружает host. */
  remotes?: Record<string, string>
  /** Дополнительные настройки приложения. */
  overrides?: UserConfig
}

export function defineAppConfig(options: AppConfigOptions): UserConfig
