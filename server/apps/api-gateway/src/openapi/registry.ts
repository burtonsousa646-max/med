import { RequestMethod, Type } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js'
import { readFileSync } from 'node:fs'
import type { ApiDocument, AppDefinition, ResolvedOperation } from './registry.types.ts'

/** Читает метаданные NestJS, используемые для сверки маршрутов. */
function metadata(key: string, target: object): unknown {
  const value: unknown = Reflect.getMetadata(key, target)
  return value
}

/** Проверяет и хранит маршруты приложений и их привязку к контрактам. */
export class OpenApiRegistry {
  private readonly documents = new Map<string, ApiDocument>()
  private readonly routes: (ResolvedOperation & { parts: string[] })[] = []

  /** Получает зависимости и настройки компонента. */
  constructor(readonly apps: readonly AppDefinition[]) {
    const signatures = new Set<string>()
    for (const app of apps) {
      if (!/^[a-z][a-z0-9-]*$/.test(app.id) || this.documents.has(app.id))
        throw new Error('Неоднозначное приложение')
      const prefix = app.prefix ?? `/api/${app.id}`
      const doc = JSON.parse(readFileSync(app.documentFile, 'utf8')) as ApiDocument
      if (doc.openapi !== '3.1.0' || doc.servers.length !== 1 || doc.servers[0]?.url !== prefix)
        throw new Error('Некорректный префикс приложения')
      this.documents.set(app.id, doc)
      const found = new Set<string>()
      for (const [path, methods] of Object.entries(doc.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
          if (!['get', 'post', 'patch', 'put', 'delete', 'head', 'options'].includes(method))
            continue
          const binding = app.operations.find(
            (b) =>
              b.path === path &&
              b.method.toLowerCase() === method &&
              b.operationId === operation.operationId,
          )
          if (!binding || !operation.operationId || found.has(operation.operationId))
            throw new Error('Несоответствие операции и обработчика')
          if ((operation['x-suggestion-rate-limit'] === true) !== (binding.rateLimit === true))
            throw new Error('Несоответствие политики ограничения')
          found.add(operation.operationId)
          const route = `${prefix}${path}`
          const signature = `${method}:${route.replace(/\{[^}]+\}/g, '{}')}`
          if (signatures.has(signature)) throw new Error('Неоднозначный маршрут')
          signatures.add(signature)
          const prototype = binding.controller.prototype as object
          const handler: unknown = Reflect.get(prototype, binding.handler)
          if (typeof handler !== 'function') throw new Error('Обработчик отсутствует')
          const classPath =
            (metadata(PATH_METADATA, binding.controller) as string | undefined) ?? ''
          const methodPath = (metadata(PATH_METADATA, handler) as string | undefined) ?? ''
          const actual = `/${[classPath, methodPath].join('/').split('/').filter(Boolean).join('/')}`
          const expected = route.replace(
            /\{([^}]+)\}/g,
            (_, name: string) => `:${name.replaceAll('-', '_')}`,
          )
          const verb = metadata(METHOD_METADATA, handler) as RequestMethod | undefined
          if (
            actual !== expected ||
            verb === undefined ||
            RequestMethod[verb].toLowerCase() !== method
          )
            throw new Error('Маршрут контроллера отличается от контракта')
          this.routes.push({ appId: app.id, operation, binding, route, parts: route.split('/') })
        }
      }
      if (found.size !== app.operations.length) throw new Error('Лишний binding')
    }
    this.routes.sort((a, b) => {
      for (let index = 0; index < Math.min(a.parts.length, b.parts.length); index++) {
        const firstIsParameter = a.parts[index]?.startsWith('{') === true
        const secondIsParameter = b.parts[index]?.startsWith('{') === true

        if (firstIsParameter !== secondIsParameter) return firstIsParameter ? 1 : -1
      }

      return 0
    })
  }

  /** Ищет операцию по HTTP-методу и пути с учётом префикса приложения. */
  resolve(method: string, pathname: string): ResolvedOperation | undefined {
    if (/%2f|%5c/i.test(pathname)) return undefined
    const parts = pathname.split('/')
    return this.routes.find(
      (r) =>
        r.binding.method.toUpperCase() === method &&
        r.parts.length === parts.length &&
        r.parts.every((p, i) => (p.startsWith('{') ? Boolean(parts[i]) : p === parts[i])),
    )
  }

  /** Возвращает документ OpenAPI зарегистрированного приложения. */
  getDocument(appId: string): ApiDocument {
    const doc = this.documents.get(appId)
    if (!doc) throw new Error('Приложение отсутствует')
    return doc
  }

  /** Возвращает разрешённые контрактом имена флагов приложения. */
  getFeatureFlagNames(appId: string): string[] {
    return Object.keys(this.getDocument(appId).components?.schemas?.FeatureFlags?.properties ?? {})
  }

  /** Возвращает список флагов из схемы выбранного веб-приложения. */
  getPlatformFeatureFlagNames(webApp: string): string[] | undefined {
    const document = this.getDocument('platform')
    const mapping =
      document.paths['/v1/feature-flags/{web-app}']?.['get']?.['x-web-app-feature-flags']
    if (!mapping || typeof mapping !== 'object' || !Object.hasOwn(mapping, webApp)) return undefined
    const schema: unknown = (mapping as Record<string, unknown>)[webApp]
    if (typeof schema !== 'string') throw new Error('Некорректная схема флагов')
    const schemas = document.components?.schemas
    if (!schemas || !Object.hasOwn(schemas, schema)) throw new Error('Схема флагов отсутствует')
    return Object.keys(schemas[schema]?.properties ?? {})
  }

  /** Сверяет зарегистрированные контроллеры с маршрутами реестра. */
  assertControllers(controllers: readonly Type[], ignored: readonly Type[]): void {
    for (const controller of controllers) {
      if (ignored.includes(controller)) continue
      const prototype = controller.prototype as object
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler: unknown = Reflect.get(prototype, name)
        if (
          typeof handler === 'function' &&
          metadata(METHOD_METADATA, handler) !== undefined &&
          !this.routes.some(
            (r) => r.binding.controller === controller && r.binding.handler === name,
          )
        )
          throw new Error('Незарегистрированный контроллер')
      }
    }
  }
}
