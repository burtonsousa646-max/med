import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as notificationsApi from '@/mock-api/resources/notifications'

export function useNotifications(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['notifications', partnerId ?? 'none'],
    queryFn: () => notificationsApi.listNotifications(partnerId!),
    enabled: !!partnerId,
  })
}

export function useMarkNotificationRead(partnerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', partnerId ?? 'none'] }),
  })
}

export function useMarkAllNotificationsRead(partnerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(partnerId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', partnerId ?? 'none'] }),
  })
}
