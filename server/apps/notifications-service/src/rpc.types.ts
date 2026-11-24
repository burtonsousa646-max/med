import type { NotificationChannel } from '@platform/contracts/notifications/v1/notifications'
import type { ChannelTransport } from './application'

export interface RpcOptions {
  clients: ReadonlyMap<string, string>
  transports: ReadonlyMap<NotificationChannel, ChannelTransport>
  timeoutMs: number
  resultReserveMs: number
}
