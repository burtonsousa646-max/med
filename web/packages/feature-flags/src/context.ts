import { createContext } from 'react'

/** Значение контекста: имя флага → включён ли он. */
export type FlagValues = Readonly<Record<string, boolean>>

// Один контекст на всю страницу: пакет загружается в одном экземпляре для host и всех module
// (список общих библиотек — в пресете @platform/web-config/vite).
export const FeatureFlagsContext = createContext<FlagValues | null>(null)

/** Оставляет только свойства со значением `true` или `false`: остальное в контекст не попадает. */
export function toFlagValues(source: object): FlagValues {
  const values: Record<string, boolean> = {}
  for (const [name, value] of Object.entries(source)) {
    if (typeof value === 'boolean') {
      values[name] = value
    }
  }
  return values
}
