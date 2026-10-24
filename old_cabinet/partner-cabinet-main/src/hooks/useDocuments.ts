import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as documentsApi from '@/mock-api/resources/documents'
import type { DocumentType } from '@/mock-api/types'
import { partnerKeys } from './usePartners'

export function useEffectiveDocuments(type?: DocumentType) {
  return useQuery({
    queryKey: ['documents', 'effective', type ?? 'all'],
    queryFn: () => documentsApi.listEffectiveDocuments(type),
  })
}

export function useAcceptances(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['acceptances', partnerId ?? 'none'],
    queryFn: () => documentsApi.listAcceptances(partnerId!),
    enabled: !!partnerId,
  })
}

export function useAcceptDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: documentsApi.acceptDocument,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['acceptances', vars.partnerId] })
      qc.invalidateQueries({ queryKey: partnerKeys.detail(vars.partnerId) })
    },
  })
}
