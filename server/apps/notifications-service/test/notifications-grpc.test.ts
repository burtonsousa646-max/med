import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID, X509Certificate } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { credentials, Metadata, status, type CallOptions } from '@grpc/grpc-js'
import { ClientGrpcProxy } from '@nestjs/microservices'
import { readNotificationsConfig } from '@platform/config'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'
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
  const transports = new Map([
    [email, { transport: 'smtp', senderConfig: 'test', send: mail }],
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
      package: 'platform.notifications.v1',
      protoPath: protoPath('notifications/v1/notifications.proto'),
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
