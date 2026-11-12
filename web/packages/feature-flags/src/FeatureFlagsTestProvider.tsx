import { useMemo, type ReactNode } from 'react'

import { FeatureFlagsContext, toFlagValues } from './context'

export interface FeatureFlagsTestProviderProps<Flags extends object> {
  flags: Partial<Record<keyof Flags & string, boolean>>
  children: ReactNode
}

/** Задаёт флаги в тестах и stories — без TanStack Query и сети. */
export function FeatureFlagsTestProvider<Flags extends object>({
  flags,
  children,
}: FeatureFlagsTestProviderProps<Flags>): ReactNode {
  const values = useMemo(() => toFlagValues(flags), [flags])
  return <FeatureFlagsContext value={values}>{children}</FeatureFlagsContext>
}
