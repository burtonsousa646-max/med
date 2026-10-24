import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as supportApi from '@/mock-api/resources/support'

export function useCases(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['support', 'cases', partnerId ?? 'none'],
    queryFn: () => supportApi.listCases(partnerId!),
    enabled: !!partnerId,
  })
}

export function useMessages(caseId: string | undefined) {
  return useQuery({
    queryKey: ['support', 'messages', caseId ?? 'none'],
    queryFn: () => supportApi.listMessages(caseId!),
    enabled: !!caseId,
  })
}

export function useCreateCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: supportApi.createCase,
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['support', 'cases', data.partnerId] }),
  })
}

export function usePostMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: supportApi.postMessage,
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['support', 'messages', data.caseId] }),
  })
}

export function useResolveCase(partnerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: supportApi.resolveCase,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support', 'cases', partnerId ?? 'none'] }),
  })
}
