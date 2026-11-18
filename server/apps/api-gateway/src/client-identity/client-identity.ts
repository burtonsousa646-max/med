import type { Request } from 'express'
import { isIP, SocketAddress } from 'node:net'
import { GatewayError } from '../errors.ts'
import type { ClientIdentity, Ip, VerifiedIdentityReader } from './client-identity.types.ts'

/** Возвращает анонимный контекст до появления проверенной сессии. */
export class AnonymousOnlyIdentityReader implements VerifiedIdentityReader {
  /** Получает подтверждённую идентичность из доверенного источника. */
  read(_request: Request): Promise<undefined> {
    return Promise.resolve(undefined)
  }
}

/** Преобразует IP-адрес в байты для проверки сетевых диапазонов. */
function ipBytes(ip: string): number[] {
  if (isIP(ip) === 4) return ip.split('.').map(Number)
  let text = ip
  if (text.includes('.')) {
    const colon = text.lastIndexOf(':')
    const v4 = text
      .slice(colon + 1)
      .split('.')
      .map(Number)
    text =
      text.slice(0, colon) +
      ':' +
      (((v4[0] ?? 0) << 8) | (v4[1] ?? 0)).toString(16) +
      ':' +
      (((v4[2] ?? 0) << 8) | (v4[3] ?? 0)).toString(16)
  }
  const [left, right] = text.split('::')
  const head = left ? left.split(':') : []
  const tail = right ? right.split(':') : []
  const words =
    right === undefined
      ? head
      : [...head, ...Array<string>(8 - head.length - tail.length).fill('0'), ...tail]
  return words.flatMap((word) => {
    const n = parseInt(word, 16)
    return [n >> 8, n & 255]
  })
}

/** Проверяет и нормализует IP-адрес клиента. */
export function canonicalIp(input: string): Ip {
  const family = isIP(input)
  if (!family || input.includes('%')) throw new GatewayError(400)
  const parsed = SocketAddress.parse(family === 6 ? `[${input}]:1` : `${input}:1`)
  if (!parsed) throw new GatewayError(400)
  const bytes = ipBytes(parsed.address)
  if (
    bytes.length === 16 &&
    bytes.slice(0, 10).every((x) => x === 0) &&
    bytes[10] === 255 &&
    bytes[11] === 255
  ) {
    const v4 = bytes.slice(12)
    return { address: v4.join('.'), bytes: v4 }
  }
  return { address: parsed.address.toLowerCase(), bytes }
}

/** Определяет адрес клиента с учётом доверенных прокси и подтверждённой сессии. */
export class ClientIdentityResolver {
  private readonly networks: { ip: Ip; prefix: number }[]

  /** Получает зависимости и настройки компонента. */
  constructor(
    cidrs: readonly string[],
    private readonly users: VerifiedIdentityReader = new AnonymousOnlyIdentityReader(),
  ) {
    this.networks = cidrs.map((cidr) => {
      const [address, raw] = cidr.split('/')
      const ip = canonicalIp(address ?? '')
      let prefix = Number(raw)
      if (isIP(address ?? '') === 6 && ip.bytes.length === 4) prefix -= 96
      if (!Number.isInteger(prefix) || prefix < 1 || prefix > ip.bytes.length * 8)
        throw new Error('Некорректная сеть доверенного прокси')
      return { ip, prefix }
    })
  }

  /** Проверяет, входит ли адрес в список доверенных прокси. */
  private trusted(ip: Ip): boolean {
    return this.networks.some(
      (network) =>
        network.ip.bytes.length === ip.bytes.length &&
        ip.bytes.every((byte, index) => {
          const bits = Math.max(0, Math.min(8, network.prefix - index * 8))
          const mask = bits ? (255 << (8 - bits)) & 255 : 0
          return (byte & mask) === ((network.ip.bytes[index] ?? 0) & mask)
        }),
    )
  }

  /** Ищет операцию по HTTP-методу и пути с учётом префикса приложения. */
  async resolve(request: Request): Promise<ClientIdentity> {
    let peer = canonicalIp(request.socket.remoteAddress ?? '')
    const header = request.headers['x-forwarded-for']
    if (this.trusted(peer) && header !== undefined) {
      if (typeof header !== 'string' || Buffer.byteLength(header) > 2048)
        throw new GatewayError(400)
      const chain = header.split(',').map((part) => part.trim())
      if (chain.length > 16) throw new GatewayError(400)

      // Проверяем всю цепочку доверенного peer, даже игнорируемую левую часть.
      const ips = chain.map(canonicalIp)
      for (let i = ips.length - 1; i >= 0 && this.trusted(peer); i--) {
        const next = ips[i]
        if (next) peer = next
      }
    }
    const verifiedUser = await this.users.read(request)
    if (verifiedUser && (!verifiedUser.realm || !verifiedUser.subject)) throw new GatewayError(503)
    return { canonicalIp: peer.address, verifiedUser }
  }
}
