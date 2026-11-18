import { createClient } from 'redis'

// Соединение не воспроизводит команды после разрыва и не держит offline-очередь.
/** Управляет Redis-соединением без offline-очереди команд. */
export class RedisConnection {
  private readonly client
  private connecting?: Promise<void>
  private retry?: ReturnType<typeof setTimeout>
  private closed = false

  /** Получает зависимости и настройки компонента. */
  constructor(
    url: string,
    private readonly timeoutMs: number,
    private readonly diagnostic: () => void = () => {},
  ) {
    this.client = createClient({
      url,
      disableOfflineQueue: true,
      commandsQueueMaxLength: 1024,
      socket: { reconnectStrategy: false, connectTimeout: 1000 },
    })
    this.client.on('error', () => {
      this.diagnostic()
      this.schedule()
    })
    this.client.on('end', () => {
      this.schedule()
    })
  }

  /** Подключается к Redis, разделяя параллельные попытки. */
  connect(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Соединение закрыто'))
    if (this.client.isReady) return Promise.resolve()
    if (this.connecting) return this.connecting
    this.connecting = this.client
      .connect()
      .then(() => {})
      .catch(() => {
        this.schedule()
        throw new Error('Redis недоступен')
      })
      .finally(() => {
        this.connecting = undefined
      })
    return this.connecting
  }

  /** Планирует повторное подключение после сбоя Redis. */
  private schedule(): void {
    if (this.closed || this.retry) return
    this.retry = setTimeout(() => {
      this.retry = undefined
      void this.connect().catch(() => {
        this.schedule()
      })
    }, 1000)
    this.retry.unref()
  }

  /** Возвращает готовый клиент с бюджетом и сигналом отмены операции. */
  current(signal?: AbortSignal) {
    if (!this.client.isReady) {
      void this.connect().catch(() => {
        this.schedule()
      })
      throw new Error('Redis недоступен')
    }
    return this.client.withCommandOptions({ timeout: this.timeoutMs, abortSignal: signal })
  }

  /** Закрывает ресурс и освобождает связанные соединения. */
  close(): void {
    this.closed = true
    clearTimeout(this.retry)
    if (this.client.isOpen) this.client.destroy()
  }
}
