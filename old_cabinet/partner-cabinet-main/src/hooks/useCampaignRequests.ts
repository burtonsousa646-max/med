import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as campaignApi from '@/mock-api/resources/campaignRequests'

export function useCampaignRequests(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['campaignRequests', partnerId ?? 'none'],
    queryFn: () => campaignApi.listCampaignRequests(partnerId!),
    enabled: !!partnerId,
  })
}

export function useCreateCampaignRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: campaignApi.createCampaignRequest,
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['campaignRequests', data.partnerId] }),
  })
}

export function useCancelCampaignRequest(partnerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: campaignApi.cancelCampaignRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaignRequests', partnerId ?? 'none'] }),
  })
}
