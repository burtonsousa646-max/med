import { Api, Logger, TelegramClient, errors, extensions, helpers, sessions } from 'telegram'
import { LogLevel } from 'telegram/extensions/Logger.js'
import type {
  TelegramClientFactory,
  TelegramClientPort,
} from '../../application/ports/telegram.port.ts'
import type { AttemptOutcome } from '../../application/submission.types.ts'

interface TelegramCredentials {
  apiId: number
  apiHash: string
  session: string
  accountId: string
}

type GramJsClient = Pick<TelegramClient, 'connect' | 'destroy' | 'invoke'>

const inaccessibleRecipient = new Set([
  'PHONE_NOT_OCCUPIED',
  'PHONE_NUMBER_INVALID',
  'PEER_ID_INVALID',
  'INPUT_USER_DEACTIVATED',
  'USER_PRIVACY_RESTRICTED',
  'USER_IS_BLOCKED',
  'YOU_BLOCKED_USER',
  'USER_NOT_MUTUAL_CONTACT',
  'PRIVACY_PREMIUM_REQUIRED',
  'CHAT_WRITE_FORBIDDEN',
  'CHAT_RESTRICTED',
])

/** GramJS иногда переподключается внутри MTProto, даже при выключенном autoReconnect. */
function createGramJsClient(config: TelegramCredentials, signal: AbortSignal): GramJsClient {
  let used = false
  class AttemptSocket extends extensions.PromisedNetSockets {
    private readonly abort = () => {
      void this.close().catch(() => undefined)
    }

    override async connect(port: number, ip: string) {
      signal.throwIfAborted()
      if (used) throw new Error('Повторное подключение Telegram в рамках попытки запрещено')
      used = true
      signal.addEventListener('abort', this.abort, { once: true })
      return await super.connect(port, ip)
    }

    override write(data: Buffer) {
      signal.throwIfAborted()
      super.write(data)
    }

    override async close() {
      signal.removeEventListener('abort', this.abort)
      await super.close()
    }
  }

  return new TelegramClient(
    new sessions.StringSession(config.session),
    config.apiId,
    config.apiHash,
    {
      requestRetries: 1,
      connectionRetries: 1,
      reconnectRetries: 0,
      retryDelay: 0,
      autoReconnect: false,
      floodSleepThreshold: 0,
      baseLogger: new Logger(LogLevel.NONE),
      networkSocket: AttemptSocket,
    },
  )
}

/** Изолирует вызовы GramJS и наружу отдаёт только исход и идентификаторы личного адресата. */
export class GramJsTelegramClient implements TelegramClientFactory {
  private accountVerified = false

  constructor(
    private readonly config: TelegramCredentials,
    private readonly createClient = createGramJsClient,
  ) {}

  async connect(signal: AbortSignal) {
    signal.throwIfAborted()
    const scope = new AbortController()
    const sessionSignal = AbortSignal.any([signal, scope.signal])
    const client = this.createClient(this.config, sessionSignal)
    const close = async () => {
      scope.abort()
      await client.destroy().catch(() => undefined)
    }
    try {
      if (!(await withAbort(() => client.connect(), sessionSignal))) {
        throw new Error('Не удалось подключиться к Telegram')
      }
      if (!this.accountVerified) {
        const [account] = await withAbort(
          () => client.invoke(new Api.users.GetUsers({ id: [new Api.InputUserSelf()] })),
          sessionSignal,
        )
        if (
          !(account instanceof Api.User) ||
          account.bot ||
          account.id.toString() !== this.config.accountId
        ) {
          throw new Error('Сессия Telegram принадлежит другой учётной записи')
        }
        this.accountVerified = true
      }
      return { ...telegramCalls(client), close }
    } catch (error) {
      await close()
      throw error
    }
  }
}

function telegramCalls(client: GramJsClient): TelegramClientPort {
  return {
    async resolvePhone(phone, signal) {
      try {
        const result = await withAbort(
          () => client.invoke(new Api.contacts.ResolvePhone({ phone })),
          signal,
        )
        const peer = result.peer
        if (peer instanceof Api.PeerUser) {
          const user = result.users.find((entry) => entry.id.equals(peer.userId))
          if (
            user instanceof Api.User &&
            user.accessHash &&
            !user.bot &&
            !user.deleted &&
            !user.min &&
            !user.self
          ) {
            return {
              kind: 'resolved',
              peer: {
                userId: BigInt(user.id.toString()),
                accessHash: BigInt(user.accessHash.toString()),
              },
            }
          }
        }
        return { kind: 'recipient_unavailable' }
      } catch (error) {
        const reason = rejectedReason(error)
        return { kind: reason ?? 'temporary_rejection' }
      }
    },

    async sendText({ peer, text, randomId, signal }) {
      try {
        const wireRandomId = helpers.returnBigInt(randomId)
        const request = new Api.messages.SendMessage({
          peer: new Api.InputPeerUser({
            userId: helpers.returnBigInt(peer.userId),
            accessHash: helpers.returnBigInt(peer.accessHash),
          }),
          message: text,
          randomId: wireRandomId,
          noWebpage: true,
        })
        const result = await withAbort(() => client.invoke(request), signal)
        return submissionResult(result, wireRandomId)
      } catch (error) {
        const reason = rejectedReason(error)
        return reason ? { submission: 'not_sent', reason } : { submission: 'unconfirmed' }
      }
    },
  }
}

function rejectedReason(error: unknown) {
  if (!(error instanceof errors.RPCError)) return undefined
  if (error.errorMessage === 'RANDOM_ID_DUPLICATE') return undefined
  if (inaccessibleRecipient.has(error.errorMessage)) return 'recipient_unavailable' as const
  if (error.code === 420 || error.code === 429 || error.code === 303)
    return 'temporary_rejection' as const
  if (error.code === 400 || error.code === 401 || error.code === 403 || error.code === 406) {
    return 'provider_rejected' as const
  }
  return undefined
}

function submissionResult(
  result: Api.TypeUpdates,
  randomId: ReturnType<typeof helpers.returnBigInt>,
): AttemptOutcome {
  if (result instanceof Api.UpdateShortSentMessage)
    return { submission: 'sent', providerId: String(result.id) }
  if (result instanceof Api.Updates || result instanceof Api.UpdatesCombined) {
    const update = result.updates.find(
      (item) => item instanceof Api.UpdateMessageID && item.randomId?.equals(randomId),
    )
    if (update instanceof Api.UpdateMessageID)
      return { submission: 'sent', providerId: String(update.id) }
  }
  return { submission: 'unconfirmed' }
}

/** GramJS не принимает AbortSignal в invoke. Не ждём потерянный ответ до закрытия соединения. */
async function withAbort<T>(request: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  const interrupted = Promise.withResolvers<never>()
  const abort = () => {
    interrupted.reject(new Error('Вызов Telegram отменён'))
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    return await Promise.race([interrupted.promise, request()])
  } finally {
    signal.removeEventListener('abort', abort)
  }
}
