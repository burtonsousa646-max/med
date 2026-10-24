import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as codeBatchesApi from '@/mock-api/resources/codeBatches'

export function useCodeBatches(offerVersionId: string | undefined) {
  return useQuery({
    queryKey: ['codeBatches', offerVersionId ?? 'none'],
    queryFn: () => codeBatchesApi.listCodeBatches(offerVersionId!),
    enabled: !!offerVersionId,
  })
}

export function useCodes(batchId: string | undefined) {
  return useQuery({
    queryKey: ['codes', batchId ?? 'none'],
    queryFn: () => codeBatchesApi.listCodes(batchId!),
    enabled: !!batchId,
  })
}

export function useCommitCodeBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: codeBatchesApi.commitCodeBatch,
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['codeBatches', data.offerVersionId] }),
  })
}
