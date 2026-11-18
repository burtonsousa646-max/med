/**
 * Общий бюджет вызова: сигнал отмены и абсолютный дедлайн в миллисекундах Unix.
 */
export interface SuggestContext {
  signal: AbortSignal
  deadlineAtMs: number
}
