import { readNotificationsConfig } from '@platform/config'
import { createNotificationsApp } from './app.ts'

try {
  const app = await createNotificationsApp(readNotificationsConfig(process.env))
  app.enableShutdownHooks()
  await app.listen()
} catch {
  // Ошибка среды может содержать путь к ключу или строку подключения.
  process.stderr.write('Не удалось запустить сервис нотификаций\n')
  process.exitCode = 1
}
