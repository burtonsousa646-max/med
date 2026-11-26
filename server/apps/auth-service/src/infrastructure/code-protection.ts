import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto'
import type { CodeProtection } from '../application/ports'

/** Привязка шифротекста к адресу исключает перенос проверок между профилями. */
export class EncryptedCodes implements CodeProtection {
  constructor(private readonly key: Buffer) {}

  issue(email: string): string {
    const code = randomInt(1_000_000).toString().padStart(6, '0')
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce)
    cipher.setAAD(Buffer.from(email))
    const ciphertext = Buffer.concat([cipher.update(code, 'ascii'), cipher.final()])
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64')
  }

  /** Открывает код только внутри адаптера для проверки или передачи доставщику. */
  open(email: string, sealed: string): Buffer {
    const bytes = Buffer.from(sealed, 'base64')
    const cipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12))
    cipher.setAAD(Buffer.from(email))
    cipher.setAuthTag(bytes.subarray(12, 28))
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()])
  }

  matches(email: string, sealed: string, input: string): boolean {
    return timingSafeEqual(this.open(email, sealed), Buffer.from(input, 'ascii'))
  }
}
