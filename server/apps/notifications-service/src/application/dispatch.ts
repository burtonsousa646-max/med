import { createHmac } from 'node:crypto'
import type { SendNotificationRequest } from '@platform/contracts/notifications/v1/notifications'
import type { FingerprintKeys } from './dispatch.types.ts'

/** Проверяет форму поручения и подготавливает бизнес-поля в однозначном порядке. */
export function canonicalDispatch(request: SendNotificationRequest) {
  if (
    !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(request.dispatchId) ||
    !request.text.trim() ||
    (!request.email?.trim() && !request.phone?.trim()) ||
    !request.channels.length
  )
    throw new Error('invalid_dispatch')
  const time = request.expiresAt
  if (
    time &&
    (!/^-?\d+$/.test(time.seconds) ||
      Number(time.seconds) < -62135596800 ||
      Number(time.seconds) > 253402300799 ||
      !Number.isInteger(time.nanos) ||
      time.nanos < 0 ||
      time.nanos >= 1_000_000_000)
  )
    throw new Error('invalid_dispatch')
  const channels = [...new Set(request.channels.map(String))].sort()
  const payload = JSON.stringify([
    request.text,
    request.email?.trim() || null,
    request.phone?.trim() || null,
    channels,
    time ? [Number(time.seconds), time.nanos] : null,
  ])
  const expiresAt = time
    ? new Date(Number(time.seconds) * 1000 + Math.ceil(time.nanos / 1_000_000))
    : null
  return { channels, payload, expiresAt }
}

/** Отсутствующий ключ исключает сравнение или регистрацию с другой версией. */
export function fingerprint(payload: string, keys: FingerprintKeys, version: string) {
  const key = keys.versions.get(version)
  if (!key || key.length < 32) throw new Error('fingerprint_key_unavailable')
  return createHmac('sha256', key).update(payload).digest('hex')
}

/** Proto-loader возвращает неизвестное числовое значение enum как число. */
export function channelKey(value: string | number): string {
  return String(value)
}
