import { Api, errors, helpers } from 'telegram'
import { describe, expect, it, vi } from 'vitest'
import { GramJsTelegramClient } from './gramjs-telegram.client.ts'

const senderId = helpers.returnBigInt('10001')
const recipientId = helpers.returnBigInt('10002')
const accessHash = helpers.returnBigInt('10003')
const randomId = -9_001_234_567_890_123_456n
const contact = '+12025550101'
const text = 'Синтетическое уведомление'

/** Подменяет только сетевой вызов, сохраняя реальные запросы и типы ответов GramJS. */
function setup() {
  const rpc = vi.fn<(request: Api.AnyRequest) => Promise<unknown>>()
  rpc.mockResolvedValueOnce([new Api.User({ id: senderId })])
  const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const factory = new GramJsTelegramClient(
    {
      accountId: senderId.toString(),
      apiId: 1,
      apiHash: 'synthetic-hash',
      session: 'synthetic-session',
    },
    () => ({
      connect: () => Promise.resolve(true),
      invoke: rpc,
      destroy,
    }),
  )
  const controller = new AbortController()
  const input = {
    text,
    randomId,
    signal: controller.signal,
    peer: { userId: BigInt(recipientId.toString()), accessHash: BigInt(accessHash.toString()) },
  }
  return { factory, rpc, destroy, input, controller }
}

describe('Клиент Telegram на GramJS', () => {
  it('R3.1 разрешает номер в личного пользователя и передаёт исходный random_id без потери точности', async () => {
    const { factory, rpc, input } = setup()
    rpc.mockResolvedValueOnce(
      new Api.contacts.ResolvedPeer({
        peer: new Api.PeerUser({ userId: recipientId }),
        users: [new Api.User({ id: recipientId, accessHash })],
        chats: [],
      }),
    )
    rpc.mockResolvedValueOnce(
      new Api.Updates({
        updates: [new Api.UpdateMessageID({ id: 42, randomId: helpers.returnBigInt(randomId) })],
        users: [],
        chats: [],
        date: 0,
        seq: 0,
      }),
    )

    const client = await factory.connect(input.signal)
    try {
      await expect(client.resolvePhone(contact, input.signal)).resolves.toEqual({
        kind: 'resolved',
        peer: input.peer,
      })
      expect(rpc.mock.calls[1]?.[0]).toBeInstanceOf(Api.contacts.ResolvePhone)
      expect(rpc.mock.calls[1]?.[0]).toMatchObject({ phone: contact })
      await expect(client.sendText(input)).resolves.toEqual({
        submission: 'sent',
        providerId: '42',
      })
      const request = rpc.mock.calls[2]?.[0]
      expect(request).toBeInstanceOf(Api.messages.SendMessage)
      if (!(request instanceof Api.messages.SendMessage))
        throw new Error('Ожидался запрос отправки')
      expect(request.peer).toBeInstanceOf(Api.InputPeerUser)
      expect(request.randomId?.toString()).toBe(randomId.toString())
      expect(request.message).toBe(text)
    } finally {
      await client.close()
    }
  })

  it('R3.2 не использует группу, даже если ответ содержит пользователя', async () => {
    const { factory, rpc, input } = setup()
    rpc.mockResolvedValueOnce(
      new Api.contacts.ResolvedPeer({
        peer: new Api.PeerChannel({ channelId: recipientId }),
        users: [new Api.User({ id: recipientId, accessHash })],
        chats: [],
      }),
    )
    const client = await factory.connect(input.signal)
    try {
      await expect(client.resolvePhone(contact, input.signal)).resolves.toEqual({
        kind: 'recipient_unavailable',
      })
    } finally {
      await client.close()
    }
  })

  it('R3.2 возвращает недоступность для скрытого или несуществующего номера', async () => {
    const { factory, rpc, input } = setup()
    const request = new Api.contacts.ResolvePhone({ phone: contact })
    rpc.mockRejectedValueOnce(new errors.RPCError('PHONE_NOT_OCCUPIED', request, 400))
    const client = await factory.connect(input.signal)
    try {
      await expect(client.resolvePhone(contact, input.signal)).resolves.toEqual({
        kind: 'recipient_unavailable',
      })
    } finally {
      await client.close()
    }
  })

  it('R1.4 возвращает временный отказ при FLOOD_WAIT и не запускает новый RPC', async () => {
    const { factory, rpc, input } = setup()
    const request = new Api.messages.SendMessage({ message: text })
    rpc.mockRejectedValueOnce(new errors.RPCError('FLOOD_WAIT_30', request, 420))
    const client = await factory.connect(input.signal)
    try {
      await expect(client.sendText(input)).resolves.toEqual({
        submission: 'not_sent',
        reason: 'temporary_rejection',
      })
      expect(rpc).toHaveBeenCalledTimes(2)
    } finally {
      await client.close()
    }
  })

  it('R1.4 оставляет исход неопределённым, когда отмена опережает ответ на отправку', async () => {
    const { factory, rpc, destroy, input, controller } = setup()
    rpc.mockImplementationOnce(() => {
      controller.abort()
      return Promise.withResolvers<unknown>().promise
    })
    const client = await factory.connect(input.signal)
    try {
      await expect(client.sendText(input)).resolves.toEqual({ submission: 'unconfirmed' })
      expect(rpc).toHaveBeenCalledTimes(2)
    } finally {
      await client.close()
    }
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('не допускает поиск номера с сессией другой учётной записи', async () => {
    const { factory, rpc, destroy, input } = setup()
    rpc.mockReset().mockResolvedValueOnce([new Api.User({ id: recipientId })])

    await expect(factory.connect(input.signal)).rejects.toThrow('другой учётной записи')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
