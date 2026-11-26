import { describe, expect, it, vi } from 'vitest'
import { PostboxEmailTransport } from './postbox-email.transport.ts'

const sender = {
  endpoint: 'https://postbox.example.test',
  id: 'service-mail',
  from: 'sender@example.test',
  subject: 'Уведомление платформы',
  configurationSet: 'notifications',
}
const attempt = {
  attemptId: 'fea57c85-35f7-48a5-8fc9-82f71b524bde',
  contact: 'recipient@example.test',
  text: 'Тестовое уведомление',
  expiresAt: Infinity,
  signal: new AbortController().signal,
}
const token = 'synthetic-iam-token'

describe('Почтовый транспорт Postbox', () => {
  it('R2.2 R2.5 R4.7 передаёт письмо с меткой попытки и подтверждает приём по MessageId', async () => {
    const request = vi.fn<typeof fetch>(async (url, options) => {
      const outgoing = new Request(url, options)
      expect(outgoing.url).toBe('https://postbox.example.test/v2/email/outbound-emails')
      expect(outgoing.method).toBe('POST')
      expect(outgoing.redirect).toBe('error')
      expect(outgoing.headers.get('X-YaCloud-SubjectToken')).toBe(token)
      const payload = await outgoing.text()
      expect(outgoing.headers.get('Content-Length')).toBe(String(Buffer.byteLength(payload)))
      expect(JSON.parse(payload)).toEqual({
        ConfigurationSetName: sender.configurationSet,
        FromEmailAddress: sender.from,
        Destination: { ToAddresses: [attempt.contact] },
        Content: {
          Simple: {
            Subject: { Data: sender.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: attempt.text, Charset: 'UTF-8' } },
          },
        },
        EmailTags: [{ Name: 'attempt_id', Value: attempt.attemptId }],
      })
      return Response.json({ MessageId: 'message_123' })
    })
    const transport = new PostboxEmailTransport(sender, () => token, request)

    await expect(transport.send(attempt)).resolves.toEqual({
      submission: 'sent',
      providerId: 'message_123',
    })
    expect(request).toHaveBeenCalledTimes(1)
    expect(transport).toMatchObject({ transport: 'postbox', senderConfig: sender.id })
  })

  it.each([400, 401, 403, 404])('R2.3 скрывает тело отказа Postbox (%i)', async (status) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ message: [token, attempt.contact, attempt.text].join(' ') }, { status }),
      )
    const transport = new PostboxEmailTransport(sender, () => token, request)

    await expect(transport.send(attempt)).resolves.toEqual({
      submission: 'not_sent',
      reason: 'provider_rejected',
    })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('R1.4 возвращает временный отказ при исчерпании квоты Postbox', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 }))
    const transport = new PostboxEmailTransport(sender, () => token, request)

    await expect(transport.send(attempt)).resolves.toEqual({
      submission: 'not_sent',
      reason: 'temporary_rejection',
    })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('R1.4 возвращает временный отказ без запроса при недоступности учётных данных', async () => {
    const request = vi.fn<typeof fetch>()
    const transport = new PostboxEmailTransport(sender, () => undefined, request)

    await expect(transport.send(attempt)).resolves.toEqual({
      submission: 'not_sent',
      reason: 'temporary_rejection',
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('R4.3 проверяет срок после получения учётных данных', async () => {
    vi.useFakeTimers()
    try {
      const request = vi.fn<typeof fetch>()
      const expiresAt = Date.now() + 1
      const transport = new PostboxEmailTransport(
        sender,
        () => {
          vi.setSystemTime(expiresAt)
          return token
        },
        request,
      )

      await expect(transport.send({ ...attempt, expiresAt })).resolves.toEqual({
        submission: 'not_sent',
        reason: 'expired',
      })
      expect(request).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('R4.5 оставляет исход неопределённым при потере ответа без повторного запроса', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error(attempt.text))
    const transport = new PostboxEmailTransport(sender, () => token, request)

    await expect(transport.send(attempt)).resolves.toEqual({ submission: 'unconfirmed' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('R4.5 оставляет исход неопределённым, когда ответ не содержит допустимого MessageId', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ MessageId: token + '@' }))
    const transport = new PostboxEmailTransport(sender, () => token, request)

    await expect(transport.send(attempt)).resolves.toEqual({ submission: 'unconfirmed' })
    expect(request).toHaveBeenCalledTimes(1)
  })
})
