// Feature toggles для сервисов и API Gateway — ADR 0001, specs/architecture/structure.md,
// раздел «@platform/feature-flags — backend». SDK Unleash используется только внутри пакета.
//
// Сервис подключает модуль в корневом модуле и проверяет флаги через свой порт флагов:
//   FeatureFlagsModule.forRoot({ appName: 'campaigns-service' })
// В тестах сервисов — FeatureFlagsModule.forTesting({ ... }) или InMemoryFeatureFlags.
export { type FeatureFlagsConfig, readFeatureFlagsConfig } from './config.js'
export { FeatureFlagsClient } from './feature-flags.client.js'
export { FeatureFlagsModule } from './feature-flags.module.js'
export { InMemoryFeatureFlags } from './in-memory-feature-flags.js'
export type { FeatureFlagsReader, FlagContext } from './types.js'
