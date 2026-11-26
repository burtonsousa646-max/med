import { randomBytes, randomUUID } from 'node:crypto'
import { NestFactory } from '@nestjs/core'
import {
  NotificationChannel,
  SubmissionStatus,
} from '@platform/contracts/notifications/v1/notifications'
import { InMemoryFeatureFlags } from '@platform/feature-flags'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { SendNotification, type ChannelTransport } from '../src/application'
import { EXTERNAL_EMAIL_PROVIDER } from '../src/application/feature-flags.ts'
import { DispatchStore, NotificationsDatabase } from '../src/infrastructure/prisma'
import { NotificationsModule } from '../src/notifications.module.ts'

const url = process.env['TEST_NOTIFICATIONS_DATABASE_URL']
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Требуется отдельная TEST_NOTIFICATIONS_DATABASE_URL с суффиксом _test')
const keys = { current: 'v1', versions: new Map([['v1', randomBytes(32)]]) }
const channel = NotificationChannel.NOTIFICATION_CHANNEL_EMAIL
const route = { transport: 'smtp', senderConfig: 'default' }

function request() {
  return {
    dispatchId: randomUUID(),
    text: 'Код для проверки',
    email: 'person@example.test',
    phone: undefined,
    channels: [channel],
    expiresAt: undefined,
    retryAttemptIds: [],
  }
}

describe('Транзакции хранилища поручений', () => {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>
  let db: NotificationsDatabase
  let store: DispatchStore
  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(NotificationsModule.forRoot(url, keys), {
      logger: false,
    })
    db = app.get(NotificationsDatabase)
    store = app.get(DispatchStore)
  })
  afterAll(() => app.close())

  it('R2.4 R4.5 использует SMTP без кеша и применяет смену флага только к новой попытке', async () => {
    const smtp = vi.fn<ChannelTransport['send']>().mockResolvedValue({ submission: 'unconfirmed' })
    const external = vi.fn<ChannelTransport['send']>().mockResolvedValue({ submission: 'sent' })
    const flags = new InMemoryFeatureFlags()
    const isEnabled = vi.spyOn(flags, 'isEnabled')
    const scenario = new SendNotification(
      store,
      new Map([[channel, { ...route, send: smtp }]]),
      3000,
      150,
      flags,
      { transport: 'external', senderConfig: 'test', send: external },
    )
    const command = request()
    const context = { deadline: Infinity, signal: new AbortController().signal }
    const original = await scenario.execute('test', command, context)
    expect(original.results[0]?.status).toBe(SubmissionStatus.SUBMISSION_STATUS_UNCONFIRMED)
    expect(isEnabled).toHaveBeenCalledExactlyOnceWith(EXTERNAL_EMAIL_PROVIDER)

    flags.set(EXTERNAL_EMAIL_PROVIDER, true)
    expect(await scenario.execute('test', command, context)).toEqual(original)
    expect(isEnabled).toHaveBeenCalledTimes(1)
    expect(external).not.toHaveBeenCalled()
    expect(smtp).toHaveBeenCalledTimes(1)

    const next = await scenario.execute('test', request(), context)
    expect(next.results[0]?.status).toBe(SubmissionStatus.SUBMISSION_STATUS_SENT)
    expect(external).toHaveBeenCalledTimes(1)
    expect(isEnabled).toHaveBeenCalledTimes(2)
    await expect(
      db.submissionAttempt.findUnique({ where: { id: next.results[0]!.attemptId! } }),
    ).resolves.toMatchObject({ transport: 'external', senderConfig: 'test' })

    flags.set(EXTERNAL_EMAIL_PROVIDER, false)
    await scenario.execute('test', request(), context)
    expect(smtp).toHaveBeenCalledTimes(2)
    expect(external).toHaveBeenCalledTimes(1)
  })

  it('одна попытка для конкурирующих регистраций и повторного обращения после перезапуска', async () => {
    const command = request()
    const results = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const id = await store.register('auth', command)
        return store.reserve(id, channel, route)
      }),
    )
    expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(1)
    expect(results.filter((r) => r.kind === 'existing')).toHaveLength(5)
    const id = await store.register('auth', command)
    const attempts = await db.submissionAttempt.findMany({
      where: { channel: { dispatchKey: id } },
    })
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ submission: 'unconfirmed', transport: 'smtp' })
    const newKeys = {
      current: 'v2',
      versions: new Map([...keys.versions, ['v2', randomBytes(32)]]),
    }
    const restarted = new DispatchStore(db, newKeys)
    expect(await restarted.register('auth', command)).toBe(id)
    expect(await restarted.reserve(id, channel, { ...route, transport: 'postbox' })).toEqual({
      kind: 'existing',
      attemptId: attempts[0]!.id,
    })
    expect(await db.dispatchAudit.count({ where: { dispatchKey: id, event: 'started' } })).toBe(1)
  })

  it('различает замену содержания, новый ключ и другого инициатора', async () => {
    const command = request()
    const id = await store.register('auth', command)
    await expect(store.register('auth', { ...command, text: 'другое сообщение' })).rejects.toThrow(
      'dispatch_conflict',
    )
    expect(await store.register('auth', { ...command, dispatchId: randomUUID() })).not.toBe(id)
    expect(await store.register('partners', command)).not.toBe(id)
  })

  it('сбой записи аудита откатывает уже вставленную попытку', async () => {
    const key = await store.register('auth', request())
    // Триггер моделирует отказ PostgreSQL именно после регистрации попытки.
    await db.$executeRaw`CREATE FUNCTION test_fail_started() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event = 'started' AND EXISTS
          (SELECT 1 FROM submission_attempts WHERE id = NEW.attempt_id AND sender_config = 'rollback_fixture')
        THEN RAISE EXCEPTION 'test audit unavailable'; END IF;
        RETURN NEW;
      END $$`
    try {
      await db.$executeRaw`CREATE TRIGGER test_fail_started BEFORE INSERT ON dispatch_audit FOR EACH ROW EXECUTE FUNCTION test_fail_started()`
      await expect(
        store.reserve(key, channel, { ...route, senderConfig: 'rollback_fixture' }),
      ).rejects.toThrow()
      expect(await db.submissionAttempt.count({ where: { channel: { dispatchKey: key } } })).toBe(0)
      expect(await db.dispatchAudit.count({ where: { dispatchKey: key, event: 'started' } })).toBe(
        0,
      )
      expect((await store.reserve(key, channel, route)).kind).toBe('reserved')
    } finally {
      await db.$executeRaw`DROP FUNCTION test_fail_started() CASCADE`
    }
  })

  it('не начинает передачу после истечения срока', async () => {
    const id = await store.register('auth', { ...request(), expiresAt: { seconds: '0', nanos: 0 } })
    expect(await store.reserve(id, channel, route)).toEqual({ kind: 'expired' })
    expect(await db.submissionAttempt.count({ where: { channel: { dispatchKey: id } } })).toBe(0)
  })
})
