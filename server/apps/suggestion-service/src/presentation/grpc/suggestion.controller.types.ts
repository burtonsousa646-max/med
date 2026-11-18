/**
 * Минимальная часть unary-контекста, нужная для дедлайна и отмены без привязки к виду RPC.
 */
export interface RpcContext {
  /** Абсолютный дедлайн транспорта: Date или миллисекунды Unix, Infinity — без ограничения. */
  getDeadline(): Date | number
  readonly cancelled: boolean

  /** Однократная подписка на отмену клиентом; не заменяет проверку флага cancelled. */
  once(event: 'cancelled', listener: () => void): unknown

  /** Снимает подписку по завершении поиска, чтобы контекст вызова мог освободиться. */
  removeListener(event: 'cancelled', listener: () => void): unknown
}
