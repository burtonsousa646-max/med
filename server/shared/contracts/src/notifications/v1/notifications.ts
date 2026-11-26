// Публичный контракт отправителя. На проводе отсутствующий контакт опускается.
import type {
  NotificationsServiceClient as WireClient,
  SendNotificationRequest as WireRequest,
} from '../../generated/notifications/v1/notifications.ts'

export * from '../../generated/notifications/v1/notifications.ts'

/** Инициатор явно задаёт оба ключа, в том числе при отправке только в один канал. */
export type SendNotificationRequest = Omit<WireRequest, 'email' | 'phone'> & {
  email: string | undefined
  phone: string | undefined
}

/** Возвращаемый тип и дополнительные параметры вызова определяет protobuf-контракт. */
export interface NotificationsServiceClient extends Omit<WireClient, 'sendNotification'> {
  sendNotification(request: SendNotificationRequest): ReturnType<WireClient['sendNotification']>
}
