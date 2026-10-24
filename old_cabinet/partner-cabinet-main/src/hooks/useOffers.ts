import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as offersApi from '@/mock-api/resources/offers'

export const offerKeys = {
  list: (partnerId: string) => ['offers', partnerId] as const,
  detail: (offerId: string) => ['offers', 'detail', offerId] as const,
  versions: (offerId: string) => ['offers', offerId, 'versions'] as const,
}

export function useOffers(partnerId: string | undefined) {
  return useQuery({
    queryKey: partnerId ? offerKeys.list(partnerId) : offerKeys.list('none'),
    queryFn: () => offersApi.listOffers(partnerId!),
    enabled: !!partnerId,
    refetchInterval: (query) => (query.state.data?.some((o) => o.lifecycleStatus === 'in_review') ? 2000 : false),
  })
}

export function useOfferModels(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['offers', partnerId ?? 'none', 'models'] as const,
    queryFn: () => offersApi.listOfferModels(partnerId!),
    enabled: !!partnerId,
  })
}

export function useOffer(offerId: string | undefined) {
  return useQuery({
    queryKey: offerId ? offerKeys.detail(offerId) : offerKeys.detail('none'),
    queryFn: () => offersApi.getOffer(offerId!),
    enabled: !!offerId,
    // Пока оффер на модерации — опрашиваем чаще, чтобы автоматическая демо-модерация
    // подхватилась без ручного обновления страницы.
    refetchInterval: (query) => (query.state.data?.lifecycleStatus === 'in_review' ? 2000 : false),
  })
}

export function useOfferVersions(offerId: string | undefined) {
  return useQuery({
    queryKey: offerId ? offerKeys.versions(offerId) : offerKeys.versions('none'),
    queryFn: () => offersApi.listOfferVersions(offerId!),
    enabled: !!offerId,
    refetchInterval: (query) => (query.state.data?.some((v) => v.moderationStatus === 'in_review') ? 2000 : false),
  })
}

export function useModerationQueue() {
  return useQuery({
    queryKey: ['offers', 'moderationQueue'],
    queryFn: offersApi.listModerationQueue,
    refetchInterval: (query) => (query.state.data && query.state.data.length > 0 ? 2000 : false),
  })
}

export function useCreateOfferDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: offersApi.createOfferDraft,
    onSuccess: (data) => qc.invalidateQueries({ queryKey: offerKeys.list(data.offer.partnerId) }),
  })
}

export function useSubmitOfferForModeration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { offerId: string; versionId: string }) =>
      offersApi.submitOfferForModeration(input.offerId, input.versionId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: offerKeys.detail(vars.offerId) })
      qc.invalidateQueries({ queryKey: offerKeys.versions(vars.offerId) })
    },
  })
}

export function useModerateOfferVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      versionId: string
      decision: offersApi.ModerationDecision
      note: string | null
      moderatorLabel: string
    }) => offersApi.moderateOfferVersion(input.versionId, input.decision, input.note, input.moderatorLabel),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  })
}
