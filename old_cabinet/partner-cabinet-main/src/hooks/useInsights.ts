import { useQuery, useQueryClient } from '@tanstack/react-query'
import { generatePartnerInsights } from '@/mock-api/resources/insights'

/** Однократно за сессию (на partnerId) генерирует проактивные уведомления и обновляет
 *  список уведомлений, если что-то новое появилось. */
export function useGeneratePartnerInsights(partnerId: string | undefined) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['insights', partnerId ?? 'none'],
    queryFn: async () => {
      const result = await generatePartnerInsights(partnerId!)
      if (result.generated > 0) {
        qc.invalidateQueries({ queryKey: ['notifications', partnerId] })
      }
      return result
    },
    enabled: !!partnerId,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
}
