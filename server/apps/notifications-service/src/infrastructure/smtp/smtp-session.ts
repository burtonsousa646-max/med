import type { Socket } from 'node:net'

/** Читает ответы одной SMTP-сессии, включая многострочный ответ EHLO. */
export class SmtpSession {
  private readonly reader: AsyncIterator<Buffer>
  private buffer = ''

  constructor(private readonly socket: Socket) {
    this.reader = socket.iterator({ destroyOnReturn: false })
  }

  command(command: string) {
    this.socket.write(command + '\r\n')
    return this.reply()
  }

  async reply(): Promise<{ code: number; lines: string[] }> {
    const lines: string[] = []
    let code: number | undefined
    let size = 0
    for (;;) {
      const line = await this.line()
      size += line.length + 2
      const match = /^(\d{3})([- ]|$)(.*)$/u.exec(line)
      if (!match || size > 64 * 1024) throw new Error('Некорректный ответ SMTP')
      const nextCode = Number(match[1])
      if (code !== undefined && nextCode !== code) throw new Error('Некорректный ответ SMTP')
      code = nextCode
      lines.push(match[3] ?? '')
      if (match[2] !== '-') return { code, lines }
    }
  }

  /** Снимает читатель перед передачей сокета TLS. */
  async release() {
    if (this.buffer) throw new Error('Лишние данные перед STARTTLS')
    await this.reader.return?.()
  }

  private async line(): Promise<string> {
    for (;;) {
      const end = this.buffer.indexOf('\r\n')
      if (end >= 0) {
        const line = this.buffer.slice(0, end)
        this.buffer = this.buffer.slice(end + 2)
        return line
      }
      if (this.buffer.length > 64 * 1024) throw new Error('Слишком длинный ответ SMTP')
      const next = await this.reader.next()
      if (next.done) throw new Error('SMTP-сервер закрыл соединение')
      this.buffer += next.value.toString('latin1')
    }
  }
}
