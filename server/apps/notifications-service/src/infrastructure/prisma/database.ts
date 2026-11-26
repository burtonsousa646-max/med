import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/client.ts'

/** Владеет пулом соединений сервиса; Nest закрывает его при остановке. */
export class NotificationsDatabase extends PrismaClient {
  constructor(databaseUrl: string) {
    super({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
