import {
  Controller,
  DynamicModule,
  Get,
  Header,
  Injectable,
  Module,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common'
import { GrpcMethod, RpcException } from '@nestjs/microservices'
import { HealthCheckService, TerminusModule } from '@nestjs/terminus'
import { HealthCheckResponse_ServingStatus } from '@platform/contracts/grpc/health/v1/health'
import type {
  HealthController as HealthRpc,
  HealthCheckRequest,
  HealthCheckResponse,
} from '@platform/contracts/grpc/health/v1/health'
import { status } from '@grpc/grpc-js'

/** Хранит состояние готовности процесса; после начала остановки готовность не восстанавливается. */
@Injectable()
export class HealthState {
  private phase: 'initializing' | 'ready' | 'shutdown' = 'initializing'
  private dependencyProbe?: () => Promise<boolean>
  constructor(readonly serviceName: string) {}

  /** Отмечает готовность, если остановка ещё не началась. */
  markReady(): void {
    if (this.phase !== 'shutdown') this.phase = 'ready'
  }

  /** Необратимо снимает готовность процесса. */
  beginShutdown(): void {
    this.phase = 'shutdown'
  }

  onModuleDestroy() {
    this.beginShutdown()
  }

  /** Возвращает текущий признак готовности. */
  isReady(): boolean {
    return this.phase === 'ready'
  }

  /** Позволяет сервису проверять обязательную зависимость в общем HTTP/gRPC healthcheck. */
  setDependencyProbe(probe: () => Promise<boolean>) {
    this.dependencyProbe = probe
  }

  async checkReady(): Promise<boolean> {
    if (!this.isReady()) return false
    try {
      return (!this.dependencyProbe || (await this.dependencyProbe())) && this.isReady()
    } catch {
      return false
    }
  }
}

/** Публикует HTTP-проверки жизни и готовности процесса. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly state: HealthState,
    private readonly checks: HealthCheckService,
  ) {}

  /** Запрещает лишние параметры healthcheck-запроса. */
  private validate(query: Record<string, unknown>): void {
    if (Object.keys(query).length)
      throw new BadRequestException({ code: 'invalid_request', message: 'Некорректный запрос' })
  }

  /** Подтверждает работоспособность процесса без проверки внешних зависимостей. */
  @Get('live')
  @Header('Cache-Control', 'no-store')
  async live(@Query() query: Record<string, unknown>) {
    this.validate(query)
    await this.checks.check([() => ({ process: { status: 'up' as const } })])
    return { status: 'ok' }
  }

  /** Возвращает 503 до готовности и после начала остановки. */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ) {
    this.validate(query)
    if (!(await this.state.checkReady())) {
      response.status(503)
      return { code: 'not_ready', message: 'Сервис не готов принимать запросы' }
    }
    await this.checks.check([() => ({ process: { status: 'up' as const } })])
    return { status: 'ok' }
  }
}

/** Реализует стандартную проверку готовности gRPC. */
@Controller()
export class GrpcHealthController implements HealthRpc {
  constructor(private readonly state: HealthState) {}

  /** Возвращает состояние сервиса либо NOT_FOUND для неизвестного имени. */
  @GrpcMethod('Health', 'Check')
  async check(request: HealthCheckRequest): Promise<HealthCheckResponse> {
    if (request.service && request.service !== this.state.serviceName)
      throw new RpcException({ code: status.NOT_FOUND, message: 'Ресурс не найден' })
    return {
      status: (await this.state.checkReady())
        ? HealthCheckResponse_ServingStatus.SERVING
        : HealthCheckResponse_ServingStatus.NOT_SERVING,
    }
  }
}

/** Подключает HTTP и gRPC проверки к приложению NestJS. */
@Module({})
export class HealthModule {
  /** Регистрирует проверки и общее состояние готовности. */
  static register(options: { serviceName: string }): DynamicModule {
    return {
      module: HealthModule,
      global: true,
      imports: [TerminusModule],
      controllers: [HealthController, GrpcHealthController],
      providers: [{ provide: HealthState, useFactory: () => new HealthState(options.serviceName) }],
      exports: [HealthState],
    }
  }
}
