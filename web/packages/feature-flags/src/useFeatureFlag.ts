import { use } from 'react'

import { FeatureFlagsContext } from './context'

/** Имя флага из типа флагов приложения. */
type FlagName<Flags extends object> = keyof Flags & string

/** Флаг включён? Тип флагов — components['schemas']['FeatureFlags'] приложения. */
export function useFeatureFlag<Flags extends object>(name: FlagName<Flags>): boolean {
  const flags = use(FeatureFlagsContext)
  if (!flags) {
    throw new Error('Флаги не переданы: host должен подключить FeatureFlagsProvider выше по дереву')
  }
  // Флаг, которого нет в ответе, выключен.
  return flags[name] === true
}
