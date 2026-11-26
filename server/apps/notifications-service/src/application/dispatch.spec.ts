import { randomBytes, randomUUID } from 'node:crypto'
import { NotificationChannel } from '@platform/contracts/notifications/v1/notifications'
import { describe, expect, it } from 'vitest'
import { canonicalDispatch, fingerprint } from './dispatch.ts'

const emailChannel = NotificationChannel.NOTIFICATION_CHANNEL_EMAIL
const telegram = NotificationChannel.NOTIFICATION_CHANNEL_TELEGRAM
const request = {
  dispatchId: randomUUID(),
  text: 'Код: 100001',
  email: 'a@example.test',
  phone: undefined,
  channels: [emailChannel, telegram],
  expiresAt: undefined,
  retryAttemptIds: [],
}

describe('Отпечаток поручения', () => {
  it('сохраняет точный текст и срок, исключает разрешения повтора и порядок каналов', () => {
    const canonical = canonicalDispatch(request)
    expect(
      canonicalDispatch({
        ...request,
        email: ' a@example.test ',
        channels: [telegram, emailChannel, telegram],
        retryAttemptIds: [randomUUID()],
      }),
    ).toEqual(canonical)
    expect(canonicalDispatch({ ...request, text: request.text + ' ' }).payload).not.toBe(
      canonical.payload,
    )
    expect(
      canonicalDispatch({ ...request, expiresAt: { seconds: '0', nanos: 1 } }).payload,
    ).not.toBe(canonical.payload)
  })
  it('проверяет обязательные поля до обращения к базе', () => {
    for (const change of [
      { dispatchId: 'bad' },
      { text: ' ' },
      { email: undefined },
      { channels: [] },
      { expiresAt: { seconds: '1', nanos: -1 } },
    ]) {
      expect(() => canonicalDispatch({ ...request, ...change })).toThrow('invalid_dispatch')
    }
  })
  it('использует секрет запрошенной версии', () => {
    const keys = {
      current: 'b',
      versions: new Map([
        ['a', randomBytes(32)],
        ['b', randomBytes(32)],
      ]),
    }
    expect(fingerprint('text', keys, 'a')).not.toBe(fingerprint('text', keys, 'b'))
    expect(() => fingerprint('text', keys, 'c')).toThrow('fingerprint_key_unavailable')
  })
})
