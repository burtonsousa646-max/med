// Контрактные тесты на Pact JS — ai/rules/api-contracts.md, раздел «Контрактные тесты».
// Пресет backend: проверка поставщиков поднимает сервисы NestJS, которым нужны декораторы через SWC.
import { defineTestConfig } from '@platform/server-tooling/vitest'

export default defineTestConfig({
  test: {
    include: ['contract-tests/**/*.pact.test.ts'],
    // Тесты потребителей пишут pact-файлы, а проверка поставщиков их читает: запуск по одному файлу.
    fileParallelism: false,
    passWithNoTests: true,
    testTimeout: 30_000,
  },
})
