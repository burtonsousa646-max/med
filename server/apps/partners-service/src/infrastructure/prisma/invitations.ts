import type { InvitationRepository } from '../../application'
import { ProfileError } from '../../domain'
import type { PartnersDatabase } from './database.ts'
import type { Prisma, Invitation } from './generated/client.ts'

const VALIDITY_MS = 5 * 24 * 60 * 60_000

/** Используем ту же блокировку профиля, что и при оформлении кампании. */
async function lockProfile(tx: Prisma.TransactionClient, actor: string) {
  const [profile] = await tx.$queryRaw<{ organizationId: string | null }[]>`
    SELECT organization_id AS "organizationId" FROM user_profiles WHERE id = ${actor}::uuid FOR NO KEY UPDATE`
  return profile
}

/** Читает актуальное приглашение и удерживает блокировку до завершения команды. */
async function lockInvitation(tx: Prisma.TransactionClient, id: string) {
  const [invitation] = await tx.$queryRaw<Invitation[]>`
    SELECT id, creator_id AS "creatorId", recipient_email AS "recipientEmail",
           organization_id AS "organizationId", state, accepted_by_id AS "acceptedById", expires_at AS "expiresAt",
           created_at AS "createdAt"
    FROM invitations WHERE id = ${id}::uuid FOR UPDATE`
  if (!invitation) throw new ProfileError('not_found')
  return invitation
}

/** Команда допустима до точной границы срока ожидающего приглашения. */
function requirePending(invitation: Invitation, now: Date) {
  if (invitation.state !== 'pending' || invitation.expiresAt <= now)
    throw new ProfileError('invitation_conflict')
}

/** Атомарно меняет приглашения и членство в PostgreSQL. */
export class PrismaInvitations implements InvitationRepository {
  /** Часы вызываются после получения блокировок. */
  constructor(
    private readonly db: PartnersDatabase,
    private readonly clock = () => new Date(),
  ) {}

  /** Сериализует команды представителя и возвращает прежнюю квитанцию при повторе. */
  create(actor: string, email: string, id: string) {
    return this.db.$transaction(async (tx) => {
      const profile = await lockProfile(tx, actor)
      const previous = await tx.invitation.findUnique({ where: { id } })
      if (previous && (previous.creatorId !== actor || previous.recipientEmail !== email))
        throw new ProfileError('invitation_conflict')
      const organizationId = profile?.organizationId
      if (!organizationId) throw new ProfileError('forbidden')
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
      })
      if (organization.firstRepresentativeId !== actor) throw new ProfileError('forbidden')
      if (previous) return { id, expiresAt: previous.expiresAt }

      await tx.invitation.updateMany({
        where: { organizationId, recipientEmail: email, state: 'pending' },
        data: { state: 'replaced' },
      })
      const createdAt = this.clock()
      const expiresAt = new Date(createdAt.getTime() + VALIDITY_MS)
      const created = await tx.invitation.createMany({
        data: { id, organizationId, creatorId: actor, recipientEmail: email, createdAt, expiresAt },
        skipDuplicates: true,
      })
      // Другой создатель мог одновременно занять тот же UUID. Исключение откатывает и замену.
      if (!created.count) throw new ProfileError('invitation_conflict')
      return { id, expiresAt }
    })
  }

  /** Связывает подтверждённого получателя с организацией при действующем приглашении. */
  accept(actor: string, email: string, id: string) {
    return this.db.$transaction(async (tx) => {
      const profile = await lockProfile(tx, actor)
      if (!profile) throw new ProfileError('not_found')
      const invitation = await lockInvitation(tx, id)
      if (invitation.recipientEmail !== email) throw new ProfileError('not_found')
      if (invitation.state === 'accepted' && invitation.acceptedById === actor) return
      requirePending(invitation, this.clock())
      if (profile.organizationId && profile.organizationId !== invitation.organizationId)
        throw new ProfileError('invitation_conflict')
      await tx.userProfile.update({
        where: { id: actor },
        data: { organizationId: invitation.organizationId },
      })
      await tx.invitation.update({
        where: { id },
        data: { state: 'accepted', acceptedById: actor },
      })
    })
  }

  /** Отзывает ожидающее приглашение по команде создателя. */
  revoke(actor: string, id: string) {
    return this.db.$transaction(async (tx) => {
      const invitation = await lockInvitation(tx, id)
      if (invitation.creatorId !== actor) throw new ProfileError('not_found')
      if (invitation.state === 'revoked') return
      requirePending(invitation, this.clock())
      await tx.invitation.update({ where: { id }, data: { state: 'revoked' } })
    })
  }
}
