import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as settlementsApi from '@/mock-api/resources/settlements'
import type { SettlementAction } from '@/mock-api/state-machines/settlementLifecycle'

export function useSettlements(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['settlements', partnerId ?? 'none'],
    queryFn: () => settlementsApi.listSettlements(partnerId!),
    enabled: !!partnerId,
  })
}

export function useAllSettlements() {
  return useQuery({ queryKey: ['settlements', 'all'], queryFn: settlementsApi.listAllSettlements })
}

export function useSettlement(settlementId: string | undefined) {
  return useQuery({
    queryKey: ['settlements', 'detail', settlementId ?? 'none'],
    queryFn: () => settlementsApi.getSettlement(settlementId!),
    enabled: !!settlementId,
  })
}

export function useSettlementLines(settlementId: string | undefined) {
  return useQuery({
    queryKey: ['settlements', settlementId ?? 'none', 'lines'],
    queryFn: () => settlementsApi.getSettlementLines(settlementId!),
    enabled: !!settlementId,
  })
}

export function useDiscrepancies(settlementId: string | undefined) {
  return useQuery({
    queryKey: ['settlements', settlementId ?? 'none', 'discrepancies'],
    queryFn: () => settlementsApi.listDiscrepancies(settlementId!),
    enabled: !!settlementId,
  })
}

export function useRaiseDiscrepancy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: settlementsApi.raiseDiscrepancy,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['settlements', data.settlementId, 'discrepancies'] })
      qc.invalidateQueries({ queryKey: ['settlements', 'detail', data.settlementId] })
    },
  })
}

export function useAdvanceSettlement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { settlementId: string; action: SettlementAction; actorLabel: string }) =>
      settlementsApi.advanceSettlement(input.settlementId, input.action, input.actorLabel),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settlements'] }),
  })
}
