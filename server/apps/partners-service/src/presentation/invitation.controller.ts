import { Controller, Inject } from '@nestjs/common'
import { GrpcMethod } from '@nestjs/microservices'
import type {
  PartnersServiceController,
  CreateInvitationRequest,
  RevokeInvitationRequest,
  AcceptInvitationRequest,
} from '@platform/contracts/partners/v1/partners'
import { Invitations } from '../application'
import { rpcFailure } from './rpc-failure.ts'

/** Внутренние операции Gateway над приглашениями коллег. */
@Controller()
export class InvitationController implements Pick<
  PartnersServiceController,
  'createInvitation' | 'acceptInvitation' | 'revokeInvitation'
> {
  /** Подключает сценарии приглашений. */
  constructor(@Inject(Invitations) private readonly invitations: Invitations) {}

  /** Возвращает UUID приглашения и серверный срок действия. */
  @GrpcMethod('PartnersService', 'CreateInvitation')
  async createInvitation(request: CreateInvitationRequest) {
    const { id, expiresAt } = await this.invitations
      .create(request.actorUserId, request.recipientEmail, request.idempotencyKey)
      .catch(rpcFailure)
    const ms = expiresAt.getTime()
    return {
      invitation: {
        invitationId: id,
        expiresAt: { seconds: String(Math.floor(ms / 1000)), nanos: (ms % 1000) * 1_000_000 },
      },
    }
  }

  /** Подтверждает приглашение для пользователя из сессии. */
  @GrpcMethod('PartnersService', 'AcceptInvitation')
  async acceptInvitation(request: AcceptInvitationRequest) {
    await this.invitations
      .accept(request.actorUserId, request.verifiedEmail, request.invitationId)
      .catch(rpcFailure)
    return {}
  }

  /** Завершает отзыв пустым ответом gRPC. */
  @GrpcMethod('PartnersService', 'RevokeInvitation')
  async revokeInvitation(request: RevokeInvitationRequest) {
    await this.invitations.revoke(request.actorUserId, request.invitationId).catch(rpcFailure)
    return {}
  }
}
