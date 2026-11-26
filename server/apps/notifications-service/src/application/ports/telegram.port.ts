import type { AttemptOutcome } from '../submission.types.ts'

export type TelegramPeer = { userId: bigint; accessHash: bigint }

type TelegramRejection = 'recipient_unavailable' | 'temporary_rejection' | 'provider_rejected'

export type TelegramPhoneResolution =
  { kind: 'resolved'; peer: TelegramPeer } | { kind: TelegramRejection }

/** Доступ к клиентскому API ограничен поиском по телефону и отправкой в личный чат. */
export interface TelegramClientPort {
  resolvePhone(phone: string, signal: AbortSignal): Promise<TelegramPhoneResolution>
  sendText(input: {
    peer: TelegramPeer
    text: string
    randomId: bigint
    signal: AbortSignal
  }): Promise<AttemptOutcome>
}

/** Выделяет отдельное соединение Telegram на одну попытку отправки. */
export interface TelegramClientFactory {
  connect(signal: AbortSignal): Promise<TelegramClientPort & { close(): Promise<void> }>
}

/** Возвращает время ожидания по часам хранилища, если окно уже занято. */
export interface TelegramLookupWindow {
  reserve(senderId: string): Promise<{ reserved: true } | { reserved: false; retryInMs: number }>
}
