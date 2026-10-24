import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as outletsApi from '@/mock-api/resources/outlets'

export function useOutlets(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['outlets', partnerId ?? 'none'],
    queryFn: () => outletsApi.listOutlets(partnerId!),
    enabled: !!partnerId,
  })
}

export function useCreateOutlet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: outletsApi.createOutlet,
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['outlets', data.partnerId] }),
  })
}

export function useCloseOutlet(partnerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: outletsApi.closeOutlet,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlets', partnerId ?? 'none'] }),
  })
}
