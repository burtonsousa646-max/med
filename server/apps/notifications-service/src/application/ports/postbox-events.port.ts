export interface PostboxEvent {
  eventId: string
  attemptId: string
  messageId: string
  kind: 'Send' | 'Delivery' | 'Bounce'
}

export interface PostboxEventStore {
  position(source: string, shard: string): Promise<string | undefined>
  apply(source: string, event: PostboxEvent): Promise<void>
  advance(
    source: string,
    shard: string,
    previous: string | undefined,
    sequence: string,
  ): Promise<boolean>
}

/** Сырой ответ поставщика остаётся на границе чтения. */
export interface PostboxEventStream {
  shards(signal: AbortSignal): Promise<string[]>
  iterator(shard: string, after: string | undefined, signal: AbortSignal): Promise<string>
  read(
    iterator: string,
    signal: AbortSignal,
  ): Promise<{
    records: { sequence: string; data: Uint8Array }[]
    next: string | undefined
    lagMs: number
  }>
}
