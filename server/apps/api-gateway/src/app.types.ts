import type { Provider, Type } from '@nestjs/common'
import type { GatewayConfig } from '@platform/config'
import type { Request, Response } from 'express'
import type { RequestScope } from './grpc'
import type { AppDefinition, ResolvedOperation } from './openapi'

/** Задаёт зависимости, реестр приложений и настройки создаваемого Gateway. */
export interface GatewayOptions {
  config: GatewayConfig
  apps?: readonly AppDefinition[]
  testFlags?: Record<string, boolean>
  validateResponses?: boolean
  extraControllers?: Type[]
  beforeRequest?: (
    req: Request,
    res: Response,
    operation: ResolvedOperation,
    scope: RequestScope,
  ) => Promise<void>
  providers?: Provider[]
  close?: () => Promise<void>
}
