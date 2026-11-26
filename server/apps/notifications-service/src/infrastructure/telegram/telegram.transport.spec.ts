import { describe, expect, it, vi } from 'vitest'
import type {
  TelegramClientPort,
  TelegramLookupWindow,
} from '../../application/ports/telegram.port.ts'
import { TelegramTransport } from './telegram.transport.ts'

function setup() {
  const peer = { userId: 100n, accessHash: 200n }
  const reserve = vi.fn<TelegramLookupWindow['reserve']>().mockResolvedValue({ reserved: true })
  const resolvePhone = vi
    .fn<TelegramClientPort['resolvePhone']>()
    .mockResolvedValue({ kind: 'resolved', peer })
  const sendText = vi.fn<TelegramClientPort['sendText']>().mockResolvedValue({ submission: 'sent' })
  const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const transport = new TelegramTransport(
    'telegram-test',
    { reserve },
    {
      connect: () => Promise.resolve({ resolvePhone, sendText, close }),
    },
  )
  const input = {
    attemptId: '0630d321-6c1c-4826-abe1-de2972c203b7',
    contact: '+12025550101',
    text: 'Тестовое уведомление',
    expiresAt: Infinity,
    signal: new AbortController().signal,
  }
  return { transport, input, peer, reserve, resolvePhone, sendText, close }
}

describe('Транспорт Telegram', () => {
  it('R3.1 отправляет готовый текст только личному адресату и сохраняет random_id попытки', async () => {
    const { transport, input, peer, resolvePhone, sendText } = setup()

    await expect(transport.send(input)).resolves.toEqual({ submission: 'sent' })
    expect(resolvePhone).toHaveBeenCalledExactlyOnceWith(input.contact, input.signal)
    const randomId = sendText.mock.calls[0]![0].randomId
    expect(sendText).toHaveBeenCalledExactlyOnceWith({
      peer,
      text: input.text,
      randomId,
      signal: input.signal,
    })

    await transport.send(input)
    expect(sendText.mock.calls[1]![0].randomId).toBe(randomId)
  })

  it.each(['recipient_unavailable', 'temporary_rejection', 'provider_rejected'] as const)(
    'R3.2 не отправляет текст при результате разрешения номера %s',
    async (kind) => {
      const { transport, input, resolvePhone, sendText } = setup()
      resolvePhone.mockResolvedValue({ kind })

      await expect(transport.send(input)).resolves.toEqual({ submission: 'not_sent', reason: kind })
      expect(sendText).not.toHaveBeenCalled()
    },
  )

  it('R3.1 не обращается в Telegram, если свободное окно за пределами бюджета', async () => {
    const { transport, input, reserve, resolvePhone } = setup()
    reserve.mockResolvedValue({ reserved: false, retryInMs: 3000 })

    await expect(transport.send({ ...input, deadline: Date.now() + 2000 })).resolves.toEqual({
      submission: 'not_sent',
      reason: 'temporary_rejection',
    })
    expect(resolvePhone).not.toHaveBeenCalled()
  })

  it('R3.1 заново резервирует окно после ожидания', async () => {
    const { transport, input, reserve, resolvePhone } = setup()
    reserve.mockResolvedValueOnce({ reserved: false, retryInMs: 1 })

    await expect(transport.send(input)).resolves.toEqual({ submission: 'sent' })
    expect(reserve).toHaveBeenCalledTimes(2)
    expect(resolvePhone).toHaveBeenCalledTimes(1)
  })

  it('R3.1 прекращает отправку при отмене после разрешения номера', async () => {
    const { transport, input, peer, resolvePhone, sendText } = setup()
    const controller = new AbortController()
    resolvePhone.mockImplementation(() => {
      controller.abort()
      return Promise.resolve({ kind: 'resolved', peer })
    })

    await expect(transport.send({ ...input, signal: controller.signal })).resolves.toEqual({
      submission: 'not_sent',
      reason: 'temporary_rejection',
    })
    expect(sendText).not.toHaveBeenCalled()
  })

  it('R1.4 оставляет исход неопределённым при потере ответа на отправку', async () => {
    const { transport, input, sendText, close } = setup()
    sendText.mockRejectedValue(new Error('Тестовый разрыв соединения'))

    await expect(transport.send(input)).resolves.toEqual({ submission: 'unconfirmed' })
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
