import 'reflect-metadata'

import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { describe, expect, it } from 'vitest'

import { FeatureFlagsClient } from './feature-flags.client.js'
import { FeatureFlagsModule } from './feature-flags.module.js'
import { InMemoryFeatureFlags } from './in-memory-feature-flags.js'

const FLAG = 'campaigns.launch.new-checkout'
const OTHER_FLAG = 'campaigns.launch.other'

describe('InMemoryFeatureFlags (К4)', () => {
  it('отдаёт значения из словаря', () => {
    const flags = new InMemoryFeatureFlags({ [FLAG]: true, [OTHER_FLAG]: false })

    expect(flags.isEnabled(FLAG)).toBe(true)
    expect(flags.isEnabled(OTHER_FLAG)).toBe(false)
  })

  it('по умолчанию все флаги выключены', () => {
    const flags = new InMemoryFeatureFlags()

    expect(flags.isEnabled(FLAG)).toBe(false)
  })

  it('не учитывает контекст', () => {
    const flags = new InMemoryFeatureFlags({ [FLAG]: true })

    expect(flags.isEnabled(FLAG, { userId: 'u1', companyId: 'c1' })).toBe(true)
  })

  it('set включает флаг', () => {
    const flags = new InMemoryFeatureFlags()

    flags.set(FLAG, true)

    expect(flags.isEnabled(FLAG)).toBe(true)
  })

  it('set выключает флаг', () => {
    const flags = new InMemoryFeatureFlags({ [FLAG]: true })

    flags.set(FLAG, false)

    expect(flags.isEnabled(FLAG)).toBe(false)
  })
})

describe('FeatureFlagsModule.forTesting (К4)', () => {
  it('отдаёт InMemoryFeatureFlags под токеном FeatureFlagsClient', async () => {
    @Module({ imports: [FeatureFlagsModule.forTesting({ [FLAG]: true })] })
    class TestAppModule {}

    const app = await NestFactory.createApplicationContext(TestAppModule, { logger: false })
    try {
      const flags = app.get<InMemoryFeatureFlags>(FeatureFlagsClient)

      expect(flags).toBeInstanceOf(InMemoryFeatureFlags)
      expect(flags.isEnabled(FLAG)).toBe(true)
      expect(flags.isEnabled(OTHER_FLAG)).toBe(false)
    } finally {
      await app.close()
    }
  })
})
