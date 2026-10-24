import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as ordersApi from '@/mock-api/resources/orders'

export function useOrders(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['orders', partnerId ?? 'none'],
    queryFn: () => ordersApi.listOrders(partnerId!),
    enabled: !!partnerId,
  })
}

export function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ['orders', 'detail', orderId ?? 'none'],
    queryFn: () => ordersApi.getOrder(orderId!),
    enabled: !!orderId,
  })
}

export function useStatusHistory(orderId: string | undefined) {
  return useQuery({
    queryKey: ['orders', orderId ?? 'none', 'history'],
    queryFn: () => ordersApi.getStatusHistory(orderId!),
    enabled: !!orderId,
  })
}

export function useTransitionOrder(partnerId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ordersApi.TransitionOrderInput) => ordersApi.transitionOrder(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['orders', 'detail', data.id] })
      qc.invalidateQueries({ queryKey: ['orders', data.id, 'history'] })
      qc.invalidateQueries({ queryKey: ['orders', partnerId ?? 'none'] })
    },
  })
}

export function useCreateSandboxOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ordersApi.CreateSandboxOrderInput) => ordersApi.createSandboxOrder(input),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['orders', data.partnerId] }),
  })
}
