import { useQuery } from '@tanstack/react-query'
import { getDashboardSummary } from '@/mock-api/resources/dashboard'

export function useDashboardSummary(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', partnerId ?? 'none'],
    queryFn: () => getDashboardSummary(partnerId!),
    enabled: !!partnerId,
  })
}
