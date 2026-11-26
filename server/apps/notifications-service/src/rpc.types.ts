import type { readNotificationsConfig } from '@platform/config'
import type { NotificationChannel } from '@platform/contracts/notifications/v1/notifications'
import type { ChannelTransport } from './application'

export interface RpcOptions {
  clients: ReadonlyMap<string, string>
  transports: ReadonlyMap<NotificationChannel, ChannelTransport>
  externalEmail?: ChannelTransport | undefined
  enableFeatureFlags?: boolean
  telegram?: ReturnType<typeof readNotificationsConfig>['telegram']
  postboxStream?: ReturnType<typeof readNotificationsConfig>['postboxStream']
  timeoutMs: number
  resultReserveMs: number
}
