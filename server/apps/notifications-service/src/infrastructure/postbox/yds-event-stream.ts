import { createHash, createHmac } from 'node:crypto'
import type { PostboxEventStream } from '../../application/ports/postbox-events.port.ts'

interface StreamConfig {
  endpoint: string
  name: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Некорректный ответ Data Streams')
  return value as Record<string, unknown>
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Некорректный ответ Data Streams')
  return value
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Некорректный ответ Data Streams')
  return value
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const hmac = (key: Buffer | string, text: string) => createHmac('sha256', key).update(text).digest()

/** Читает выделенный поток через совместимый с Kinesis HTTP API Yandex Data Streams. */
export class YdsEventStream implements PostboxEventStream {
  private readonly endpoint: URL
  private topology?: { shards: string[]; expiresAt: number }

  constructor(
    private readonly config: StreamConfig,
    private readonly request: typeof fetch = fetch,
  ) {
    this.endpoint = new URL(config.endpoint)
  }

  async shards(signal: AbortSignal) {
    if (this.topology && this.topology.expiresAt > Date.now()) return this.topology.shards
    const shards = new Set<string>()
    let after: string | undefined
    for (;;) {
      const response = await this.call(
        'DescribeStream',
        {
          StreamName: this.config.name,
          ExclusiveStartShardId: after,
          Limit: 100,
        },
        signal,
      )
      const description = object(response['StreamDescription'])
      const page = list(description['Shards']).map((shard) => string(object(shard)['ShardId']))
      for (const shard of page) shards.add(shard)
      if (description['HasMoreShards'] !== true) {
        this.topology = { shards: [...shards], expiresAt: Date.now() + 30000 }
        return this.topology.shards
      }
      const last = page.at(-1)
      if (!last || last === after) throw new Error('Не удалось дочитать сегменты Data Streams')
      after = last
    }
  }

  async iterator(shard: string, after: string | undefined, signal: AbortSignal) {
    const response = await this.call(
      'GetShardIterator',
      {
        StreamName: this.config.name,
        ShardId: shard,
        ShardIteratorType: after ? 'AFTER_SEQUENCE_NUMBER' : 'TRIM_HORIZON',
        StartingSequenceNumber: after,
      },
      signal,
    )
    return string(response['ShardIterator'])
  }

  async read(iterator: string, signal: AbortSignal) {
    const response = await this.call('GetRecords', { ShardIterator: iterator, Limit: 100 }, signal)
    const records = list(response['Records']).map((raw) => {
      const record = object(raw)
      const sequence = string(record['SequenceNumber'])
      if (!/^\d{1,128}$/u.test(sequence) || typeof record['Data'] !== 'string') {
        throw new Error('Некорректная запись Data Streams')
      }
      return { sequence, data: Buffer.from(record['Data'], 'base64') }
    })
    const next = response['NextShardIterator']
    const lagMs = response['MillisBehindLatest']
    return {
      records,
      next: next === null || next === undefined ? undefined : string(next),
      lagMs: typeof lagMs === 'number' && Number.isFinite(lagMs) ? Math.max(0, lagMs) : 0,
    }
  }

  private async call(method: string, args: object, signal: AbortSignal) {
    const body = JSON.stringify(args)
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/gu, '')
    const day = date.slice(0, 8)
    const target = `Kinesis_20131202.${method}`
    const contentType = 'application/x-amz-json-1.1'
    const headers = `content-type:${contentType}\nhost:${this.endpoint.host}\nx-amz-date:${date}\nx-amz-target:${target}\n`
    const signedHeaders = 'content-type;host;x-amz-date;x-amz-target'
    const scope = `${day}/${this.config.region}/kinesis/aws4_request`
    const canonical = ['POST', '/', '', headers, signedHeaders, hash(body)].join('\n')
    const key = hmac(
      hmac(hmac(hmac(`AWS4${this.config.secretAccessKey}`, day), this.config.region), 'kinesis'),
      'aws4_request',
    )
    const signature = hmac(
      key,
      ['AWS4-HMAC-SHA256', date, scope, hash(canonical)].join('\n'),
    ).toString('hex')
    const response = await this.request(this.endpoint, {
      method: 'POST',
      redirect: 'error',
      body,
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      headers: {
        'Content-Type': contentType,
        'X-Amz-Date': date,
        'X-Amz-Target': target,
        Authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error('Не удалось прочитать Data Streams')
    }
    return object(await response.json())
  }
}
