import { readFile } from 'node:fs/promises'
import { readNotificationsConfig } from '@platform/config'
import { NotificationChannel } from '@platform/contracts/notifications/v1/notifications'
import { createNotificationsApp } from './app.ts'
import { PostboxEmailTransport } from './infrastructure/postbox/postbox-email.transport.ts'
import { SmtpEmailTransport } from './infrastructure/smtp/smtp-email.transport.ts'

try {
  const config = readNotificationsConfig(process.env)
  const transports = new Map<NotificationChannel, SmtpEmailTransport>()
  if (config.smtp) {
    const ca = config.smtp.caFile ? await readFile(config.smtp.caFile) : undefined
    transports.set(
      NotificationChannel.NOTIFICATION_CHANNEL_EMAIL,
      new SmtpEmailTransport({ ...config.smtp, ca }),
    )
  }
  let externalEmail: PostboxEmailTransport | undefined
  if (config.postbox) {
    const { iamToken, ...sender } = config.postbox
    externalEmail = new PostboxEmailTransport(sender, () => iamToken)
  }
  const runtime = await createNotificationsApp(config, transports, {
    enableFeatureFlags: true,
    externalEmail,
  })
  runtime.app.enableShutdownHooks()
  await runtime.listen()
} catch {
  // Ошибка среды может содержать путь к ключу или строку подключения.
  process.stderr.write('Не удалось запустить сервис нотификаций\n')
  process.exitCode = 1
}
