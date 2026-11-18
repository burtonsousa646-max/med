import { Controller, Get, Injectable } from '@nestjs/common'
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
