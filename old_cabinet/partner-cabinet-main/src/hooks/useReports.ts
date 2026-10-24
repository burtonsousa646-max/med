import { useQuery } from '@tanstack/react-query'
import * as reportsApi from '@/mock-api/resources/reports'

export function useFunnel(partnerId: string | undefined, periodDays: 7 | 30 | 90) {
  return useQuery({
    queryKey: ['reports', 'funnel', partnerId ?? 'none', periodDays],
    queryFn: () => reportsApi.getFunnel(partnerId!, periodDays),
    enabled: !!partnerId,
  })
}
