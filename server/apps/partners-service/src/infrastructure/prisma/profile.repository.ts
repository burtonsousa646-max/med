import type { ProfileRepository } from '../../application'
import type { PartnersDatabase } from './database.ts'

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

  /** В ответ для Gateway входят текущие контакты, в том числе изменённые после входа. */
  async find(userId: string) {
    const row = await this.db.userProfile.findUnique({
      where: { id: userId },
      select: { id: true, contactEmail: true, phone: true },
    })
    if (!row) return null
    return {
      userId: row.id,
      ...(row.contactEmail !== null && { contactEmail: row.contactEmail }),
      ...(row.phone !== null && { phone: row.phone }),
    }
  }
}
