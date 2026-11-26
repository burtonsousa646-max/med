import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID, X509Certificate } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { credentials, Metadata, status, type CallOptions } from '@grpc/grpc-js'
import { ClientGrpcProxy } from '@nestjs/microservices'
import { readNotificationsConfig } from '@platform/config'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'
import type { HealthClient } from '@platform/contracts/grpc/health/v1/health'
import {
  NotificationChannel as Channel,
  SubmissionStatus as Status,
  type NotificationsServiceClient,
  type SendNotificationRequest,
} from '@platform/contracts/notifications/v1/notifications'
import { firstValueFrom } from 'rxjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotificationsApp } from '../src/app.ts'
import type { ChannelTransport } from '../src/application'
import { NotificationsMetrics } from '../src/infrastructure/metrics/notifications-metrics.ts'
import { PostboxEmailTransport } from '../src/infrastructure/postbox/postbox-email.transport.ts'
import { PostboxEventReader } from '../src/infrastructure/postbox/postbox-event-reader.ts'
import { NotificationsDatabase } from '../src/infrastructure/prisma'
import { PrismaPostboxEventStore } from '../src/infrastructure/prisma/postbox-event-store.ts'
import { TelegramTransport } from '../src/infrastructure/telegram/telegram.transport.ts'

const databaseUrl = process.env['TEST_NOTIFICATIONS_DATABASE_URL']
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test'))
  throw new Error('Требуется тестовая база Notifications')
const email = Channel.NOTIFICATION_CHANNEL_EMAIL
const telegram = Channel.NOTIFICATION_CHANNEL_TELEGRAM
const sent = { submission: 'sent' } as const

/** Создаёт на время теста отдельный CA и удостоверения клиента и сервера. */
function certificates(dir: string) {
  const openssl = (...args: string[]) =>
    execFileSync('openssl', args, { cwd: dir, stdio: 'ignore' })
  openssl(
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-subj',
    '/CN=test-ca',
    '-days',
    '1',
    '-keyout',
    'ca.key',
    '-out',
    'ca.pem',
  )
  for (const name of ['localhost', 'client', 'other']) {
    openssl(
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-subj',
      '/CN=' + name,
      '-addext',
      'subjectAltName=DNS:' + name + ',IP:127.0.0.1',
      '-keyout',
      name + '.key',
      '-out',
      name + '.csr',
    )
    openssl(
      'x509',
      '-req',
      '-in',
      name + '.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-copy_extensions',
      'copy',
      '-days',
      '1',
      '-out',
      name + '.pem',
    )
  }
}

async function availablePort() {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((resolve, reject) =>
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    }),
  )
  return port
}

describe('SendNotification через gRPC с mTLS', () => {
  const mail = vi.fn<ChannelTransport['send']>()
  const message = vi.fn<ChannelTransport['send']>()
  const smtp = { transport: 'smtp', senderConfig: 'test', send: mail }
  const transports = new Map<Channel, ChannelTransport>([
    [email, smtp],
    [telegram, { transport: 'telegram', senderConfig: 'test', send: message }],
  ])
  let dir: string
  let config: ReturnType<typeof readNotificationsConfig>
  let app: Awaited<ReturnType<typeof createNotificationsApp>>
  let client: ClientGrpcProxy
  let rpc: NotificationsServiceClient

  function connect(name: string) {
    const read = (file: string) => readFileSync(join(dir, file))
    return new ClientGrpcProxy({
      url: 'localhost:' + String(config.port),
      package: ['platform.notifications.v1', 'grpc.health.v1'],
      protoPath: [
        protoPath('notifications/v1/notifications.proto'),
        protoPath('grpc/health/v1/health.proto'),
      ],
      loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs] },
      credentials: credentials.createSsl(read('ca.pem'), read(name + '.key'), read(name + '.pem')),
    })
  }
  async function start() {
    app = await createNotificationsApp(config, transports)
    await app.listen()
    client = connect('client')
    rpc = client.getService<NotificationsServiceClient>('NotificationsService')
  }
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'notification-certs-'))
    certificates(dir)
    const fingerprint = new X509Certificate(
      readFileSync(join(dir, 'client.pem')),
    ).fingerprint256.replaceAll(':', '')
    config = readNotificationsConfig({
      GRPC_HOST: '127.0.0.1',
      GRPC_PORT: String(await availablePort()),
      NOTIFICATIONS_HTTP_PORT: String(await availablePort()),
      NOTIFICATIONS_CHANNEL_TIMEOUT_MS: '100',
      NOTIFICATIONS_RESULT_RESERVE_MS: '5000',
      NOTIFICATIONS_DATABASE_URL: databaseUrl,
      NOTIFICATIONS_TLS_CA_FILE: join(dir, 'ca.pem'),
      NOTIFICATIONS_TLS_CERT_FILE: join(dir, 'localhost.pem'),
      NOTIFICATIONS_TLS_KEY_FILE: join(dir, 'localhost.key'),
      NOTIFICATIONS_HMAC_CURRENT: 'v1',
      NOTIFICATIONS_HMAC_KEYS: JSON.stringify({ v1: randomBytes(32).toString('hex') }),
      NOTIFICATIONS_CLIENT_CERTIFICATES: JSON.stringify({ [fingerprint]: 'auth-service' }),
    })
    await start()
  })
  afterAll(async () => {
    client.close()
    await app.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })
  beforeEach(() => {
    mail.mockReset().mockResolvedValue(sent)
    message.mockReset().mockResolvedValue(sent)
  })
  function request(): SendNotificationRequest {
    return {
      dispatchId: randomUUID(),
      text: 'Тест',
      email: 'mail@example.test',
      phone: undefined,
      expiresAt: { seconds: String(Math.floor(Date.now() / 1000) + 60), nanos: 0 },
      channels: [email],
      retryAttemptIds: [],
    }
  }
  const send = (command: SendNotificationRequest) => firstValueFrom(rpc.sendNotification(command))
  const operations = (path: string) =>
    fetch(`http://${config.http.host}:${config.http.port}${path}`)

  it('T7 проверяет PostgreSQL для readiness по HTTP и gRPC, сохраняя liveness', async () => {
    const health = client.getService<HealthClient>('Health')
    const check = () => firstValueFrom(health.check({ service: 'notifications-service' }))
    expect((await operations('/health/ready')).status).toBe(200)
    expect((await check()).status).toBe('SERVING')

    const database = app.app.get(NotificationsDatabase)
    const probe = vi.spyOn(database, '$queryRaw').mockRejectedValue(new Error('Тестовый сбой базы'))
    try {
      expect((await operations('/health/ready')).status).toBe(503)
      expect((await check()).status).toBe('NOT_SERVING')
      expect((await operations('/health/live')).status).toBe(200)
    } finally {
      probe.mockRestore()
    }
    expect((await check()).status).toBe('SERVING')
  })

  it('R1.4 R3.1 сохраняет успех email, если срок ожидания Telegram истёк до отправки', async () => {
    const sendText = vi.fn()
    const resolvePhone = vi.fn(
      (_phone: string, signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(new Error('Срок поиска исчерпан'))
            },
            { once: true },
          )
        }),
    )
    transports.set(
      telegram,
      new TelegramTransport(
        'telegram-test',
        { reserve: () => Promise.resolve({ reserved: true }) },
        {
          connect: () =>
            Promise.resolve({ resolvePhone, sendText, close: () => Promise.resolve() }),
        },
      ),
    )
    try {
      const result = await send({
        ...request(),
        channels: [email, telegram],
        phone: '+12025550101',
      })
      expect(result.results).toMatchObject([
        { channel: email, status: Status.SUBMISSION_STATUS_SENT },
        {
          channel: telegram,
          status: Status.SUBMISSION_STATUS_NOT_SENT,
          reason: 'temporary_rejection',
          retryable: true,
        },
      ])
      expect(resolvePhone).toHaveBeenCalledTimes(1)
      expect(sendText).not.toHaveBeenCalled()
    } finally {
      transports.set(telegram, { transport: 'telegram', senderConfig: 'test', send: message })
    }
  })

  it('R4.5 R4.6 R4.7 уточняет потерянный ответ Postbox после перезапуска без новой отправки', async () => {
    const command = { ...request(), text: 'synthetic-postbox-message' }
    const token = 'synthetic-postbox-token'
    const log = vi.spyOn(console, 'log')
    const warn = vi.spyOn(console, 'warn')
    const error = vi.spyOn(console, 'error')
    const requestToPostbox = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(`${token} ${command.email ?? ''} ${command.text}`))
    transports.set(
      email,
      new PostboxEmailTransport(
        {
          endpoint: 'https://postbox.example.test',
          id: 'postbox-test',
          from: 'sender@example.test',
          subject: 'Тестовое письмо',
          configurationSet: 'notifications-test',
        },
        () => token,
        requestToPostbox,
      ),
    )

    try {
      const result = await send(command)
      expect(result.results[0]).toMatchObject({
        status: Status.SUBMISSION_STATUS_UNCONFIRMED,
        reason: 'awaiting_confirmation',
        retryable: false,
      })
      expect(await send(command)).toEqual(result)
      expect(requestToPostbox).toHaveBeenCalledTimes(1)

      const database = app.app.get(NotificationsDatabase)
      const dispatch = await database.dispatch.findUniqueOrThrow({
        where: {
          initiator_dispatchId: { initiator: 'auth-service', dispatchId: command.dispatchId },
        },
        include: { audit: true, channels: { include: { attempts: true } } },
      })
      const attempt = dispatch.channels[0]?.attempts[0]
      expect(attempt).toMatchObject({
        id: result.results[0]?.attemptId,
        transport: 'postbox',
        senderConfig: 'postbox-test',
        submission: 'unconfirmed',
      })
      expect(dispatch.audit.some(({ attemptId }) => attemptId === attempt?.id)).toBe(true)
      const stored = JSON.stringify(dispatch)
      for (const value of [token, command.email, command.text, 'sender@example.test']) {
        expect(stored).not.toContain(value)
      }

      const attemptId = result.results[0]!.attemptId!
      const source = randomUUID()
      const identity = 'trusted-identity'
      function record(
        sequence: string,
        eventType: string,
        eventId: string,
        tag = attemptId,
        identityId = identity,
      ) {
        return {
          sequence,
          data: Buffer.from(
            JSON.stringify({
              eventType,
              eventId,
              mail: {
                messageId: 'confirmed-message',
                identityId,
                tags: { attempt_id: [tag] },
                commonHeaders: { to: [command.email], subject: command.text },
              },
            }),
          ),
        }
      }
      const bounce = record('1', 'Bounce', 'confirmed-message:1')
      const records = [
        bounce,
        { ...bounce, sequence: '2' },
        record('3', 'Send', 'confirmed-message:0'),
        record('4', 'Delivery', 'other-identity:1', attemptId, 'other-identity'),
        record('5', 'Send', 'other-attempt:1', randomUUID()),
        record('6', 'Delivery', 'confirmed-message:2'),
      ]
      const stream = {
        shards: () => Promise.resolve(['shard-0']),
        iterator: vi.fn().mockResolvedValue('iterator'),
        read: vi.fn().mockResolvedValue({ records, lagMs: 23, next: undefined }),
      }
      const store = new PrismaPostboxEventStore(database)
      vi.spyOn(store, 'advance').mockRejectedValueOnce(new Error('Сбой до фиксации позиции'))
      const signal = new AbortController().signal
      await new PostboxEventReader(source, identity, stream, store).poll(signal)
      await expect(store.position(source, 'shard-0')).resolves.toBeUndefined()
      const restarted = new PostboxEventReader(source, identity, stream, store)
      await restarted.poll(signal)
      expect(restarted.metrics()).toEqual({ healthy: true, ignored: 1, lagMs: 23 })

      await expect(store.position(source, 'shard-0')).resolves.toBe('6')
      const facts = await database.postboxEvent.findMany({
        where: { source },
        orderBy: { eventId: 'asc' },
      })
      expect(facts.map(({ eventId, result: outcome }) => [eventId, outcome])).toEqual([
        ['confirmed-message:0', 'matched'],
        ['confirmed-message:1', 'matched'],
        ['confirmed-message:2', 'conflict'],
        ['other-attempt:1', 'unmatched'],
      ])
      expect(JSON.stringify(facts)).not.toContain(command.text)
      expect(JSON.stringify(facts)).not.toContain(command.email)
      await expect(
        database.submissionAttempt.findUnique({ where: { id: attemptId } }),
      ).resolves.toMatchObject({
        submission: 'sent',
        providerId: 'confirmed-message',
        delivery: 'bounced',
      })
      expect((await send(command)).results[0]).toMatchObject({
        attemptId,
        status: Status.SUBMISSION_STATUS_SENT,
      })
      expect(requestToPostbox).toHaveBeenCalledTimes(1)

      const metricsResponse = await operations('/metrics')
      expect(metricsResponse.status).toBe(200)
      const metrics = await metricsResponse.text()
      const streamMetrics = await app.app
        .get(NotificationsMetrics)
        .render(database, restarted.metrics())
      expect(streamMetrics).toContain('notifications_postbox_stream_lag_seconds 0.023')
      expect(streamMetrics).toContain('notifications_oldest_unconfirmed_seconds ')
      expect(metrics).toContain('notifications_oldest_unconfirmed_seconds ')
      expect(metrics).toContain(
        'notifications_attempts{channel="email",transport="postbox",outcome="sent"}',
      )
      expect(metrics).toContain('notifications_replays_without_submission_total ')
      const logs = inspect([log.mock.calls, warn.mock.calls, error.mock.calls], { depth: null })
      for (const value of [
        token,
        command.email,
        command.text,
        command.dispatchId,
        attemptId,
        source,
      ]) {
        expect(metrics).not.toContain(value)
        expect(streamMetrics).not.toContain(value)
        expect(logs).not.toContain(value)
      }
    } finally {
      log.mockRestore()
      warn.mockRestore()
      error.mockRestore()
      transports.set(email, smtp)
    }
  })

  it('отвечает только доверенному инициатору и проверяет форму до попыток', async () => {
    const other = connect('other')
    try {
      await expect(
        firstValueFrom(
          other
            .getService<NotificationsServiceClient>('NotificationsService')
            .sendNotification(request()),
        ),
      ).rejects.toMatchObject({ code: status.PERMISSION_DENIED })
    } finally {
      other.close()
    }
    for (const change of [
      { text: ' ' },
      { channels: [] },
      { expiresAt: undefined },
      { dispatchId: 'bad' },
      { email: undefined },
    ]) {
      await expect(send({ ...request(), ...change })).rejects.toMatchObject({
        code: status.INVALID_ARGUMENT,
      })
    }
    expect(mail).not.toHaveBeenCalled()
  })

  it('сохраняет отдельный результат неизвестного канала, MAX и неверного контакта', async () => {
    const channels = [
      email,
      telegram,
      Channel.NOTIFICATION_CHANNEL_MAX,
      Channel.NOTIFICATION_CHANNEL_UNSPECIFIED,
      77 as unknown as Channel,
      email,
    ]
    const command = { ...request(), channels }
    const result = await send(command)
    expect(result.results.map((row) => row.channel)).toEqual(channels.slice(0, -1))
    expect(result.results.map((row) => row.reason)).toEqual([
      undefined,
      'missing_contact',
      'unsupported_channel',
      'unsupported_channel',
      'unsupported_channel',
    ])
    expect(result.results[0]?.status).toBe(Status.SUBMISSION_STATUS_SENT)
    expect(
      (await send({ ...request(), phone: 'local', channels: [telegram] })).results[0]?.reason,
    ).toBe('invalid_contact')
    await expect(send({ ...command, text: 'Изменено' })).rejects.toMatchObject({
      code: status.ABORTED,
    })
    expect(mail).toHaveBeenCalledTimes(1)
  })

  it('учитывает срок, вызывает оба транспорта с тем же текстом', async () => {
    expect(
      (await send({ ...request(), expiresAt: { seconds: '0', nanos: 0 } })).results[0]?.reason,
    ).toBe('expired')
    expect(mail).not.toHaveBeenCalled()
    const command = { ...request(), channels: [email, telegram], phone: '+79999999999' }
    const result = await send(command)
    expect(result.results.every((r) => r.status === Status.SUBMISSION_STATUS_SENT)).toBe(true)
    expect(mail.mock.calls[0]?.[0].text).toBe(command.text)
    expect(message.mock.calls[0]?.[0].text).toBe(command.text)
  })

  it('при исчерпанном бюджете до передачи возвращает доказанный пропуск', async () => {
    const proxy = client.getService<{
      sendNotification(
        request: SendNotificationRequest,
        metadata: Metadata,
        options: CallOptions,
      ): ReturnType<NotificationsServiceClient['sendNotification']>
    }>('NotificationsService')
    const result = await firstValueFrom(
      proxy.sendNotification(request(), new Metadata(), { deadline: Date.now() + 2000 }),
    )
    expect(result.results[0]).toMatchObject({
      status: Status.SUBMISSION_STATUS_NOT_SENT,
      reason: 'temporary_rejection',
      retryable: true,
    })
    expect(mail).not.toHaveBeenCalled()
  })

  it('при двух явных повторах после временного отказа выполняет одну новую попытку', async () => {
    mail.mockResolvedValueOnce({ submission: 'not_sent', reason: 'temporary_rejection' })
    const command = request()
    const first = await send(command)
    const rejected = first.results[0]!
    expect(rejected.retryable).toBe(true)
    expect((await send(command)).results).toEqual(first.results)
    await expect(
      send({ ...request(), retryAttemptIds: [rejected.attemptId!] }),
    ).rejects.toMatchObject({ code: status.ABORTED })
    await Promise.all(
      Array.from({ length: 2 }, () => send({ ...command, retryAttemptIds: [rejected.attemptId!] })),
    )
    const latest = (await send(command)).results[0]!
    expect(latest.status).toBe(Status.SUBMISSION_STATUS_SENT)
    expect(latest.attemptId).not.toBe(rejected.attemptId)
    expect(mail).toHaveBeenCalledTimes(2)
  })

  it('учитывает подтверждение адаптера после таймаута RPC без нового вызова', async () => {
    const pending = Promise.withResolvers<typeof sent>()
    mail.mockReturnValueOnce(pending.promise)
    const command = request()
    expect((await send(command)).results[0]?.status).toBe(Status.SUBMISSION_STATUS_UNCONFIRMED)
    pending.resolve(sent)
    await vi.waitFor(async () => {
      expect((await send(command)).results[0]?.status).toBe(Status.SUBMISSION_STATUS_SENT)
    })
    expect(mail).toHaveBeenCalledTimes(1)
  })

  it('после потери ответа и перезапуска не дублирует ни один из каналов', async () => {
    mail.mockImplementationOnce(() => new Promise(() => {}))
    const command = { ...request(), channels: [email, telegram], phone: '+79999999999' }
    const result = await send(command)
    expect(result.results.map((r) => r.status)).toEqual([
      Status.SUBMISSION_STATUS_UNCONFIRMED,
      Status.SUBMISSION_STATUS_SENT,
    ])
    client.close()
    await app.close()
    await start()
    expect((await send(command)).results).toEqual(result.results)
    expect(mail).toHaveBeenCalledTimes(1)
    expect(message).toHaveBeenCalledTimes(1)
  })
})
