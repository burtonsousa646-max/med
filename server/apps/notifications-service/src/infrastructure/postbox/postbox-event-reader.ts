import { setTimeout as pause } from 'node:timers/promises'
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import type {
  PostboxEvent,
  PostboxEventStore,
  PostboxEventStream,
} from '../../application/ports/postbox-events.port.ts'

const eventIdentifier = /^[a-z0-9_:-]{1,200}$/iu
const messageIdentifier = /^[a-z0-9_-]{1,160}$/iu
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu

/** Извлекает из доверенного источника только поля, необходимые для сопоставления. */
export function parsePostboxEvent(data: Uint8Array, identityId: string): PostboxEvent | undefined {
  let event: unknown
  try {
    event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data))
  } catch {
    return undefined
  }
  if (!event || typeof event !== 'object' || !('mail' in event)) return undefined
  const { mail } = event
  if (
    !mail ||
    typeof mail !== 'object' ||
    !('identityId' in mail) ||
    mail.identityId !== identityId
  )
    return undefined
  if (
    !('eventType' in event) ||
    !('eventId' in event) ||
    !('messageId' in mail) ||
    !('tags' in mail)
  )
    return undefined
  const { eventType, eventId } = event
  if (eventType !== 'Send' && eventType !== 'Delivery' && eventType !== 'Bounce') return undefined
  if (typeof eventId !== 'string' || !eventIdentifier.test(eventId)) return undefined
  if (typeof mail.messageId !== 'string' || !messageIdentifier.test(mail.messageId))
    return undefined
  if (!mail.tags || typeof mail.tags !== 'object' || !('attempt_id' in mail.tags)) return undefined
  const tag = mail.tags.attempt_id
  if (!Array.isArray(tag) || tag.length !== 1 || typeof tag[0] !== 'string' || !uuid.test(tag[0]))
    return undefined
  return { eventId, kind: eventType, messageId: mail.messageId, attemptId: tag[0].toLowerCase() }
}

interface ShardState {
  iterator: string | undefined
  position: string | undefined
  lagMs: number
}

/** Обрабатывает записи по порядку сегмента. После сбоя чтение возобновляется с позиции в БД. */
export class PostboxEventReader implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly controller = new AbortController()
  private readonly known = new Map<string, ShardState>()
  private running?: Promise<void>
  private healthy = false
  private lagMs: number | undefined
  private ignored = 0

  constructor(
    private readonly source: string,
    private readonly identityId: string,
    private readonly stream: PostboxEventStream,
    private readonly store: PostboxEventStore,
  ) {}

  onApplicationBootstrap() {
    this.running ??= this.run()
  }

  async onModuleDestroy() {
    this.controller.abort()
    await this.running
  }

  async poll(signal: AbortSignal) {
    const shards = await this.stream.shards(signal)
    const active = new Set(shards)
    for (const shard of this.known.keys()) {
      if (!active.has(shard)) this.known.delete(shard)
    }
    let healthy = true
    for (const shard of shards) {
      if (signal.aborted) return
      try {
        await this.pollShard(shard, signal)
      } catch {
        // Истёкший итератор и сбой доставки возобновляются с сохранённой позиции.
        this.known.delete(shard)
        healthy = false
      }
    }
    this.healthy = healthy
    if (healthy) this.lagMs = Math.max(0, ...[...this.known.values()].map((state) => state.lagMs))
  }

  metrics() {
    return { healthy: this.healthy, lagMs: this.lagMs, ignored: this.ignored }
  }

  private async pollShard(shard: string, signal: AbortSignal) {
    let state = this.known.get(shard)
    if (!state) {
      const position = await this.store.position(this.source, shard)
      state = { position, iterator: await this.stream.iterator(shard, position, signal), lagMs: 0 }
      this.known.set(shard, state)
    }
    if (!state.iterator) return
    const batch = await this.stream.read(state.iterator, signal)
    for (const record of batch.records) {
      signal.throwIfAborted()
      const event = parsePostboxEvent(record.data, this.identityId)
      if (event) await this.store.apply(this.source, event)
      else this.ignored++
      signal.throwIfAborted()
      // Событие уже зафиксировано. При проигрыше другого экземпляра читаем новую позицию БД.
      if (!(await this.store.advance(this.source, shard, state.position, record.sequence))) {
        this.known.delete(shard)
        return
      }
      state.position = record.sequence
    }
    state.iterator = batch.next
    state.lagMs = batch.lagMs
  }

  private async run() {
    const { signal } = this.controller
    while (!signal.aborted) {
      try {
        await this.poll(signal)
      } catch {
        // Повторяем безопасное чтение. Ошибка провайдера может содержать данные запроса.
        this.healthy = false
      }
      await pause(1000, undefined, { signal, ref: false }).catch(() => undefined)
    }
  }
}
