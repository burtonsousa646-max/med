import { Controller, Get, Injectable, Param } from '@nestjs/common'
import { GatewayError } from './errors.ts'
import { FeatureFlagsClient } from '@platform/feature-flags'
import { OpenApiRegistry } from './openapi'

/** Вычисляет только флаги, разрешённые контрактом приложения. */
@Injectable()
export class FeatureFlagsService {
  /** Получает зависимости и настройки компонента. */
  constructor(
    private readonly registry: OpenApiRegistry,
    private readonly flags: FeatureFlagsClient,
  ) {}

  evaluateNames(names: string[]): Record<string, boolean> {
    return Object.fromEntries(names.map((name) => [name, this.flags.isEnabled(name, {})]))
  }

  /** Возвращает значения флагов для указанного приложения. */
  evaluate(appId: string): Record<string, boolean> {
    return Object.fromEntries(
      this.registry
        .getFeatureFlagNames(appId)
        .map((name) => [name, this.flags.isEnabled(name, {})]),
    )
  }
}

/** Создаёт контроллер флагов, привязанный к приложению. */
export function createFeatureFlagsController(appId: string) {
  @Controller(`/api/${appId}`)
  /** Предоставляет флаги, разрешённые схемой выбранного приложения. */
  class FeatureFlagsController {
    /** Получает зависимости и настройки компонента. */
    constructor(private readonly service: FeatureFlagsService) {}
    @Get('/v1/feature-flags')
    /** Возвращает значения флагов приложения для анонимного контекста. */
    getFeatureFlags() {
      return this.service.evaluate(appId)
    }
  }
  return FeatureFlagsController
}

/** Общий маршрут выбирает белый список по идентификатору веб-приложения. */
@Controller('/api')
export class PlatformFeatureFlagsController {
  constructor(
    private readonly service: FeatureFlagsService,
    private readonly registry: OpenApiRegistry,
  ) {}

  @Get('/v1/feature-flags/:web_app')
  getFeatureFlags(@Param('web_app') webApp: string) {
    const names = this.registry.getPlatformFeatureFlagNames(webApp)
    if (!names) throw new GatewayError(404)
    return this.service.evaluateNames(names)
  }
}
