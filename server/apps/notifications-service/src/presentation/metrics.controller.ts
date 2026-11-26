import {
  Controller,
  Get,
  Header,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { NotificationsMetrics } from '../infrastructure/metrics/notifications-metrics.ts'
import { PostboxEventReader } from '../infrastructure/postbox/postbox-event-reader.ts'
import { NotificationsDatabase } from '../infrastructure/prisma'

/** Метрики доступны через внутренний HTTP-интерфейс. */
@Controller('metrics')
export class MetricsController {
  constructor(
    @Inject(NotificationsMetrics) private readonly metrics: NotificationsMetrics,
    @Inject(NotificationsDatabase) private readonly database: NotificationsDatabase,
    @Optional() @Inject(PostboxEventReader) private readonly postbox?: PostboxEventReader,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async get() {
    try {
      return await this.metrics.render(this.database, this.postbox?.metrics())
    } catch {
      throw new ServiceUnavailableException({
        code: 'metrics_unavailable',
        message: 'Метрики недоступны',
      })
    }
  }
}
