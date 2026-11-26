import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type TLSSocket } from 'node:tls'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SmtpEmailTransport } from '../src/infrastructure/smtp/smtp-email.transport.ts'

/** Управляет ответом после полного приёма DATA на настоящем TLS-соединении. */
async function smtpServer(tls: { cert: Buffer; key: Buffer }, final: string | undefined) {
  const received: string[] = []
  const sockets = new Set<TLSSocket>()
  const server = createServer(tls, (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    socket.write('220 localhost SMTP\r\n')
    let buffer = ''
    let data = false
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffer += chunk
      if (data) {
        if (!buffer.endsWith('\r\n.\r\n')) return
        received.push(buffer)
        if (final === undefined) socket.destroy()
        else socket.write(final + '\r\n')
        return
      }
      if (!buffer.endsWith('\r\n')) return
      if (buffer.startsWith('EHLO ')) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n')
      else if (buffer.startsWith('AUTH PLAIN ')) socket.write('235 Accepted\r\n')
      else if (buffer === 'DATA\r\n') {
        data = true
        socket.write('354 Continue\r\n')
      } else socket.write('250 Accepted\r\n')
      buffer = ''
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    port: (server.address() as AddressInfo).port,
    received,
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
    },
  }
}

describe('Собственный SMTP-транспорт', () => {
  let directory: string
  let tls: { cert: Buffer; key: Buffer }

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'notifications-smtp-'))
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
        '-keyout',
        'key.pem',
        '-out',
        'cert.pem',
      ],
      { cwd: directory, stdio: 'ignore' },
    )
    tls = {
      cert: readFileSync(join(directory, 'cert.pem')),
      key: readFileSync(join(directory, 'key.pem')),
    }
  })
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  const text = 'Уведомление\n.с новой строки'
  const contact = 'recipient@example.test'
  const config = {
    host: '127.0.0.1',
    implicitTls: true,
    senderConfig: 'smtp-test',
    from: 'sender@example.test',
    subject: 'Уведомление',
    username: 'test',
    password: 'synthetic',
  }
  const input = () => ({
    attemptId: 'smtp-test',
    contact,
    text,
    expiresAt: Infinity,
    signal: AbortSignal.timeout(3000),
  })

  it.each([
    ['250 Queued', { submission: 'sent' }],
    ['451 Try later', { submission: 'not_sent', reason: 'temporary_rejection' }],
    ['554 Rejected', { submission: 'not_sent', reason: 'provider_rejected' }],
    [undefined, { submission: 'unconfirmed' }],
  ])('R2.1 R4.5 сохраняет исход передачи при финальном ответе %s', async (reply, outcome) => {
    const server = await smtpServer(tls, reply)
    try {
      const transport = new SmtpEmailTransport({ ...config, port: server.port, ca: tls.cert })
      await expect(transport.send(input())).resolves.toEqual(outcome)
      expect(server.received).toHaveLength(1)
      const [headers, body] = server.received[0]!.split('\r\n\r\n')
      expect(headers).toContain(`To: ${contact}`)
      expect(Buffer.from(body!.replace(/\r\n\.\r\n$/, ''), 'base64').toString('utf8')).toBe(text)
    } finally {
      await server.close()
    }
  })

  it('R2.1 прекращает отправку при недоверенном сертификате', async () => {
    const server = await smtpServer(tls, '250 Queued')
    try {
      const transport = new SmtpEmailTransport({ ...config, port: server.port })
      await expect(transport.send(input())).resolves.toEqual({
        submission: 'not_sent',
        reason: 'temporary_rejection',
      })
      expect(server.received).toHaveLength(0)
    } finally {
      await server.close()
    }
  })
})
