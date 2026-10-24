import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as partnersApi from '@/mock-api/resources/partners'

export const partnerKeys = {
  all: ['partners'] as const,
  detail: (id: string) => ['partners', id] as const,
  checks: (partnerId?: string) => ['checkRequests', partnerId ?? 'all'] as const,
}

export function usePartner(partnerId: string | undefined) {
  return useQuery({
    queryKey: partnerId ? partnerKeys.detail(partnerId) : partnerKeys.detail('none'),
    queryFn: () => partnersApi.getPartner(partnerId!),
    enabled: !!partnerId,
    // Пока партнёр ждёт решения по проверке — опрашиваем чаще, чтобы автоматическое
    // демо-одобрение (см. autoResolvePendingChecks) подхватилось без ручного обновления.
    refetchInterval: (query) => {
      const status = query.state.data?.lifecycleStatus
      return status === 'submitted' || status === 'checking' ? 2000 : false
    },
  })
}

export function usePartners() {
  return useQuery({ queryKey: partnerKeys.all, queryFn: partnersApi.listPartners })
}

export function useCheckRequests(partnerId?: string) {
  return useQuery({
    queryKey: partnerKeys.checks(partnerId),
    queryFn: () => partnersApi.listCheckRequests(partnerId),
    refetchInterval: (query) => {
      const checks = query.state.data
      const hasPending = checks?.some((c) => c.status === 'pending')
      return hasPending ? 2000 : false
    },
  })
}

export function useCreateDraftPartner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: partnersApi.CreateDraftPartnerInput) => partnersApi.createDraftPartner(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: partnerKeys.all }),
  })
}

export function usePatchPartner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { partnerId: string; patch: Partial<partnersApi.CreateDraftPartnerInput>; expectedVersion: number }) =>
      partnersApi.patchPartner(input.partnerId, input.patch, input.expectedVersion),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: partnerKeys.detail(data.id) }),
  })
}

export function useSaveBrandAssets() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { partnerId: string } & partnersApi.BrandAssetInput) =>
      partnersApi.saveBrandAssets(input.partnerId, { kind: input.kind, dataUrl: input.dataUrl, fileName: input.fileName }),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: partnerKeys.detail(data.id) }),
  })
}

export function useSubmitPartnerForCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (partnerId: string) => partnersApi.submitPartnerForCheck(partnerId),
    onSuccess: (_data, partnerId) => {
      qc.invalidateQueries({ queryKey: partnerKeys.detail(partnerId) })
      qc.invalidateQueries({ queryKey: partnerKeys.checks() })
    },
  })
}

export function useDecideCheckRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      checkRequestId: string
      decision: partnersApi.CheckDecision
      reason: string | null
      reviewerLabel: string
      reviewerId: string
    }) =>
      partnersApi.decideCheckRequest(
        input.checkRequestId,
        input.decision,
        input.reason,
        input.reviewerLabel,
        input.reviewerId,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkRequests'] })
      qc.invalidateQueries({ queryKey: partnerKeys.all })
    },
  })
}
