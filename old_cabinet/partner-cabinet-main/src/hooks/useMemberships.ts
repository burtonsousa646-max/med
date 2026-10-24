import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as membershipsApi from '@/mock-api/resources/memberships'

export function useMemberships(partnerId: string | null | undefined) {
  return useQuery({
    queryKey: ['memberships', partnerId ?? 'none'],
    queryFn: () => membershipsApi.listMemberships(partnerId ?? null),
    enabled: partnerId !== undefined,
  })
}

export function useAllMemberships() {
  return useQuery({ queryKey: ['memberships', 'all'], queryFn: membershipsApi.listAllMemberships })
}

export function useInviteMember(partnerId: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: membershipsApi.createMembership,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memberships', partnerId ?? 'none'] }),
  })
}

export function useUpdateMemberRole(partnerId: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof membershipsApi.updateMembershipRole>) =>
      membershipsApi.updateMembershipRole(...input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memberships', partnerId ?? 'none'] }),
  })
}

export function useBlockMember(partnerId: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: membershipsApi.blockMembership,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memberships', partnerId ?? 'none'] }),
  })
}

export function useUnblockMember(partnerId: string | null | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: membershipsApi.unblockMembership,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memberships', partnerId ?? 'none'] }),
  })
}
