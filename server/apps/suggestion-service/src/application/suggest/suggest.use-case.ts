import type { SuggestContext } from './suggest.use-case.types.ts'

// Поиск подсказок: нормализация → необязательный кеш → выбранный источник.
import {
  SuggestionQuery,
  type SuggestionKind,
  sanitize,
  type SuggestionByKind,
  OperationCancelledError,
  SourceUnavailableError,
} from '../../domain/suggestion'

import type { SuggestionProvider, SuggestionCache, Clock, Diagnostics } from '../ports'

/**
 * Поиск в выбранном справочнике с необязательным кешем.
 * Сценарий не зависит от транспорта источника; отказ кеша разрешает обращение к источнику.
 */
export class SuggestUseCase {
  /** Принимает порты, построитель ключа и TTL; сетевые реализации сценарий не создаёт. */
  constructor(
    private readonly provider: SuggestionProvider,
    private readonly cache: SuggestionCache,
    private readonly cacheKey: (query: SuggestionQuery) => string,
    private readonly ttlSec: number,
    private readonly clock: Clock,
    private readonly diagnostics: Diagnostics,
  ) {}

  /**
   * Нормализует ввод, читает кеш и при промахе запрашивает до десяти вариантов.
   * Пустой и короткий ввод возвращают []; успешный пустой ответ источника тоже кешируется.
   * Порядок источника сохраняется. Ошибки источника пробрасываются без повторов и кеширования.
   * @throws InvalidQueryError При неверном вводе.
   * @throws OperationCancelledError Если запрос отменён или его дедлайн исчерпан.
   * @throws SourceUnavailableError Если ответ источника недоступен или нарушает формат.
   */
  async execute<K extends SuggestionKind>(
    kind: K,
    input: unknown,
    context: SuggestContext,
  ): Promise<SuggestionByKind[K][]> {
    const query = new SuggestionQuery(kind, input)
    this.assertActive(context)

    if (query.empty) return []

    const key = this.cacheKey(query)
    const cached = await this.readCache(kind, key, query, context)
    if (cached) return cached

    this.assertActive(context)
    const items = await this.loadFromProvider(kind, query, context)
    this.assertActive(context)

    await this.writeCache(kind, key, items, context.signal)
    this.assertActive(context)

    return items
  }

  /**
   * Проверяет сигнал и дедлайн между этапами: просроченный результат не возвращается клиенту.
   */
  private assertActive(context: SuggestContext): void {
    if (context.signal.aborted || context.deadlineAtMs <= this.clock.nowMs()) {
      throw new OperationCancelledError()
    }
  }

  /**
   * Возвращает проверенный кеш, включая [], либо undefined при промахе или отказе.
   * Отмена не превращается в промах; остальные сбои фиксируются безопасной диагностикой.
   */
  private async readCache<K extends SuggestionKind>(
    kind: K,
    key: string,
    query: SuggestionQuery,
    context: SuggestContext,
  ): Promise<SuggestionByKind[K][] | undefined> {
    try {
      const items = await this.cache.get(key, context.signal, query)
      this.assertActive(context)

      return items?.map((item) => sanitize(kind, item, true))
    } catch (error) {
      if (error instanceof OperationCancelledError) throw error

      // Кеш необязателен: сбой или повреждённые данные разрешают поиск в источнике.
      this.diagnostics.record('cache_unavailable', kind, this.provider.name)
      return undefined
    }
  }

  /**
   * Ограничивает ответ десятью элементами и проверяет модель источника.
   * При отказе записывает категорию ошибки и пробрасывает её; отмена имеет приоритет.
   */
  private async loadFromProvider<K extends SuggestionKind>(
    kind: K,
    query: SuggestionQuery,
    context: SuggestContext,
  ): Promise<SuggestionByKind[K][]> {
    try {
      const items = await this.provider.suggest(query, context.signal)
      return items.slice(0, 10).map((item) => sanitize(kind, item))
    } catch (error) {
      if (context.signal.aborted) throw new OperationCancelledError()

      const result =
        error instanceof SourceUnavailableError ? `source_${error.reason}` : 'source_unexpected'

      this.diagnostics.record(result, kind, this.provider.name)
      throw error
    }
  }

  /**
   * Пытается сохранить успешный ответ с заданным TTL. Сбой записи только диагностируется;
   * проверку отмены после записи выполняет execute, прежде чем вернуть результат.
   */
  private async writeCache<K extends SuggestionKind>(
    kind: K,
    key: string,
    items: SuggestionByKind[K][],
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this.cache.set(key, items, this.ttlSec, signal)
    } catch {
      // Ошибка сохранения не отменяет уже полученный успешный результат.
      this.diagnostics.record('cache_write_unavailable', kind, this.provider.name)
    }
  }
}
