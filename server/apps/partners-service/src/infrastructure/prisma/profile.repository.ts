import { randomUUIDv7 } from 'node:crypto'
import { ProfileError } from '../../domain'
import type { ProfileRepository } from '../../application'
import type { PartnersDatabase } from './database.ts'

function organizationView(row: { id: string; inn: string; customerName: string | null }) {
  return {
    organizationId: row.id,
    inn: row.inn,
    ...(row.customerName !== null && { customerName: row.customerName }),
  }
}

/** Уникальный ключ PostgreSQL сериализует конкурентные регистрации. */
export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly db: PartnersDatabase) {}

  /** После ожидания конкурента второе чтение видит его зафиксированную запись. */
  ensure(registrationId: string, email: string, newUserId: string) {
    return this.db.$transaction(
      async (tx) => {
        await tx.userProfile.createMany({
          data: [{ id: newUserId, registrationId, registrationEmail: email, contactEmail: email }],
          skipDuplicates: true,
        })
        return tx.userProfile.findUniqueOrThrow({
          where: { registrationId },
          select: { id: true, registrationEmail: true },
        })
      },
      { isolationLevel: 'ReadCommitted' },
    )
  }

  /** Блокировка профиля упорядочивает оформления одного пользователя, уникальный ИНН — заявки разных пользователей. */
  resolveOrganization(userId: string, inn: string, customerName?: string) {
    return this.db.$transaction(
      async (tx) => {
        const [profile] = await tx.$queryRaw<{ organizationId: string | null }[]>`
        SELECT organization_id AS "organizationId" FROM user_profiles WHERE id = ${userId}::uuid FOR UPDATE`
        if (!profile) throw new ProfileError('not_found')
        if (profile.organizationId) {
          const current = await tx.organization.findUniqueOrThrow({
            where: { id: profile.organizationId },
          })
          return organizationView(current)
        }

        if (!/^(?:[0-9]{10}|[0-9]{12})$/.test(inn)) throw new ProfileError('invalid_input')
        const id = randomUUIDv7()
        const created = await tx.organization.createMany({
          data: { id, inn, customerName: customerName ?? null, firstRepresentativeId: userId },
          skipDuplicates: true,
        })
        if (!created.count) throw new ProfileError('invitation_required')
        await tx.userProfile.update({ where: { id: userId }, data: { organizationId: id } })
        return organizationView({ id, inn, customerName: customerName ?? null })
      },
      { isolationLevel: 'ReadCommitted' },
    )
  }

  /** В ответ для Gateway входят текущие контакты, в том числе изменённые после входа. */
  async find(userId: string, organizationId?: string) {
    const row = await this.db.userProfile.findUnique({
      where: { id: userId, ...(organizationId && { organizationId }) },
      select: { id: true, contactEmail: true, phone: true, organization: true },
    })
    if (!row) return null
    return {
      userId: row.id,
      organization: row.organization ? organizationView(row.organization) : undefined,
      canInvite: row.organization?.firstRepresentativeId === row.id,
      ...(row.contactEmail !== null && { contactEmail: row.contactEmail }),
      ...(row.phone !== null && { phone: row.phone }),
    }
  }
}
