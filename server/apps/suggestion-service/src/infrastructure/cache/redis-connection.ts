import { createClient } from 'redis'

const RECONNECT_INTERVAL_MS = 1000

/** Соединение без offline-очереди и повторного исполнения команд после разрыва. */
export class RedisConnection {
  private readonly client
  private connectionAttempt?: Promise<void>
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private closed = false

  /**
   * Создаёт клиент с ограниченной очередью команд и отключённым автоматическим reconnect.
   * Повторные подключения планируются здесь; diagnostic получает только факт ошибки.
   */
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
      this.scheduleReconnect()
    })
    this.client.on('end', () => {
      this.scheduleReconnect()
    })
  }

  /** Одновременные запросы разделяют одну попытку подключения. */
  connect(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Соединение закрыто'))
    if (this.client.isReady) return Promise.resolve()
    if (this.connectionAttempt) return this.connectionAttempt

    this.connectionAttempt = this.client
      .connect()
      .then(() => {})
      .catch(() => {
        this.scheduleReconnect()
        throw new Error('Redis недоступен')
      })
      .finally(() => {
        this.connectionAttempt = undefined
      })

    return this.connectionAttempt
  }

  /** Команда получает свой бюджет; ожидание восстановления не ставит её в очередь. */
  current(signal?: AbortSignal) {
    if (!this.client.isReady) {
      void this.connect().catch(() => {
        this.scheduleReconnect()
      })
      throw new Error('Redis недоступен')
    }

    return this.client.withCommandOptions({ timeout: this.timeoutMs, abortSignal: signal })
  }

  /**
   * Необратимо закрывает соединение и отменяет запланированное восстановление.
   * Повторный вызов безопасен; выполняющиеся команды завершаются ошибкой.
   */
  close(): void {
    this.closed = true
    clearTimeout(this.reconnectTimer)
    if (this.client.isOpen) this.client.destroy()
  }

  /**
   * Планирует одну попытку восстановления через секунду, пока соединение не закрыто.
   * Таймер не удерживает процесс и не создаёт параллельных циклов переподключения.
   */
  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      void this.connect().catch(() => {
        this.scheduleReconnect()
      })
    }, RECONNECT_INTERVAL_MS)

    // Необязательная зависимость не должна удерживать останавливающийся процесс.
    this.reconnectTimer.unref()
  }
}
