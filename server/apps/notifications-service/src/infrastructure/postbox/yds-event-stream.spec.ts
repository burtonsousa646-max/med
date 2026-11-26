import { afterEach, describe, expect, it, vi } from 'vitest'
import { YdsEventStream } from './yds-event-stream.ts'

describe('Чтение выделенного потока Postbox', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('T5 подписывает запросы и возобновляет чтение после сохранённого номера', async () => {
    const name = '/ru-central1/cloud/database/postbox'
    const sequence = '1234567890123456789012345678901234567890'
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          StreamDescription: { Shards: [{ ShardId: 'shard-0' }], HasMoreShards: true },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          StreamDescription: { Shards: [{ ShardId: 'shard-1' }], HasMoreShards: false },
        }),
      )
      .mockResolvedValueOnce(Response.json({ ShardIterator: 'iterator-1' }))
      .mockResolvedValueOnce(
        Response.json({
          Records: [
            { SequenceNumber: sequence, Data: Buffer.from('test event').toString('base64') },
          ],
          MillisBehindLatest: 1000,
          NextShardIterator: 'iterator-2',
        }),
      )
    const stream = new YdsEventStream(
      {
        endpoint: 'https://streams.example.test',
        name,
        region: 'ru-central1',
        accessKeyId: 'synthetic-key',
        secretAccessKey: 'synthetic-secret',
      },
      request,
    )
    const signal = new AbortController().signal
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-26T12:00:00Z'))

    await expect(stream.shards(signal)).resolves.toEqual(['shard-0', 'shard-1'])
    const iterator = await stream.iterator('shard-1', '4', signal)
    await expect(stream.read(iterator, signal)).resolves.toEqual({
      records: [{ sequence, data: Buffer.from('test event') }],
      lagMs: 1000,
      next: 'iterator-2',
    })
    const calls = request.mock.calls.map(([url, init]) => new Request(url, init))
    expect(calls.map((call) => call.headers.get('X-Amz-Target'))).toEqual([
      'Kinesis_20131202.DescribeStream',
      'Kinesis_20131202.DescribeStream',
      'Kinesis_20131202.GetShardIterator',
      'Kinesis_20131202.GetRecords',
    ])
    expect(calls[1]?.headers.get('Authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=synthetic-key\/.+Signature=[a-f0-9]{64}$/u,
    )
    expect(calls[1]?.headers.get('Authorization')).not.toContain('synthetic-secret')
    // Эталон получен через SigV4Auth SDK AWS для первого запроса.
    expect(calls[0]?.headers.get('Authorization')).toMatch(
      /Signature=f2571ba13141708be9730d3023ce5016de164c02be05ee14efbbfcd1adc69a16$/u,
    )
    await expect(calls[2]?.json()).resolves.toEqual({
      StreamName: name,
      ShardId: 'shard-1',
      ShardIteratorType: 'AFTER_SEQUENCE_NUMBER',
      StartingSequenceNumber: '4',
    })
  })
})
