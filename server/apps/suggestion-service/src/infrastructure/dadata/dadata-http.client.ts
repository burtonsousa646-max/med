import type { DadataTransport } from './dadata-http.client.types.ts'

// HTTP-протокол DaData: один запрос с общим бюджетом на заголовки и чтение ответа.
import {
  type SuggestionKind,
  OperationCancelledError,
  SourceUnavailableError,
} from '../../domain/suggestion'

const MAX_RESPONSE_BYTES = 2_097_152

/**
 * HTTP-транспорт облачной DaData с токеном, таймаутом и ограничением тела ответа.
 * Перенаправления запрещены; повторов нет, чтобы не расходовать квоту повторно.
 */
export class DadataHttpClient implements DadataTransport {
  /** Получает проверенные URL, ключ и бюджет HTTP; fetcher подменяется в проверках транспорта. */
  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /**
   * Выполняет один POST; таймаут охватывает заголовки и полное чтение тела.
   * 403 и 429 классифицируются как quota, прочие неуспешные статусы — status.
   * Отмена родителя имеет приоритет над транспортным таймаутом.
   * @throws OperationCancelledError При отмене вызывающей операции.
   * @throws SourceUnavailableError При сетевом отказе, таймауте или непригодном ответе.
   */
  async post(
    kind: SuggestionKind,
    body: { query: string; count: number },
    parent: AbortSignal,
  ): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const signal = AbortSignal.any([parent, timeout])

    try {
      const response = await this.fetcher(new URL(kind, this.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Token ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        redirect: 'error',
        signal,
      })

      if (!response.ok) {
        await response.body?.cancel()
        const reason = [403, 429].includes(response.status) ? 'quota' : 'status'
        throw new SourceUnavailableError(reason)
      }

      // await нужен здесь, чтобы ошибки чтения тоже прошли через классификацию ниже.
      return await readJsonResponse(response)
    } catch (error) {
      if (parent.aborted) throw new OperationCancelledError()
      if (timeout.aborted) throw new SourceUnavailableError('timeout')
      if (error instanceof SourceUnavailableError) throw error

      throw new SourceUnavailableError('network')
    }
  }
}

/**
 * Читает поток до 2 МиБ независимо от Content-Length и разбирает JSON как unknown.
 * При превышении лимита отменяет чтение; блокировка reader освобождается при любом исходе.
 * @throws SourceUnavailableError Если поток, размер или JSON не соответствуют протоколу.
 */
async function readJsonResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new SourceUnavailableError('protocol')

  const chunks: Uint8Array[] = []
  let receivedBytes = 0

  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break

      const bytes: unknown = chunk.value
      if (!(bytes instanceof Uint8Array)) throw new SourceUnavailableError('protocol')

      // Content-Length может отсутствовать: ограничиваем фактически полученное тело.
      receivedBytes += bytes.byteLength
      if (receivedBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new SourceUnavailableError('response_limit')
      }

      chunks.push(bytes)
    }
  } finally {
    reader.releaseLock()
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed
  } catch {
    throw new SourceUnavailableError('protocol')
  }
}
