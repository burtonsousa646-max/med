import { useQuery } from '@tanstack/react-query'
import { useMemo, type ReactNode } from 'react'

import { FeatureFlagsContext, toFlagValues, type FlagValues } from './context'

/** Ключ запроса флагов: host перезапрашивает флаги по нему после входа и выхода. */
export const featureFlagsQueryKey = ['feature-flags'] as const

const NO_FLAGS: FlagValues = {}

export interface FeatureFlagsProviderProps<Flags extends object> {
  /** Загрузка флагов от gateway: async (signal) => unwrap(await api.GET('/v1/feature-flags', { signal })) */
  load: (signal: AbortSignal) => Promise<Flags>
  /** Что показывать, пока флаги не пришли. По умолчанию — ничего. */
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Загружает флаги от gateway и передаёт их всем module приложения.
 * Подключается только в host, внутри QueryClientProvider.
 */
export function FeatureFlagsProvider<Flags extends object>({
  load,
  fallback = null,
  children,
}: FeatureFlagsProviderProps<Flags>): ReactNode {
  const { data, isError } = useQuery({
    queryKey: featureFlagsQueryKey,
    queryFn: ({ signal }) => load(signal),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  })

  // Ошибка обновления не сбрасывает data: остаются флаги из последнего успешного ответа.
  const flags = useMemo(() => (data === undefined ? undefined : toFlagValues(data)), [data])

  if (flags !== undefined) {
    return <FeatureFlagsContext value={flags}>{children}</FeatureFlagsContext>
  }
  if (isError) {
    // Первая загрузка упала после повторов: приложение показывается, все флаги выключены.
    return <FeatureFlagsContext value={NO_FLAGS}>{children}</FeatureFlagsContext>
  }
  return fallback
}
