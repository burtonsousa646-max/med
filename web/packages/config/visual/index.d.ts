import type { PlaywrightTestConfig } from '@playwright/test'

export interface VisualConfigOptions {
  /** Порт, на котором раздаётся собранный Storybook. По умолчанию 6106. */
  port?: number
}

/** Визуальные тесты stories: скриншот каждой story сравнивается с эталоном в snapshots/ рядом с компонентом. */
export function defineVisualConfig(options?: VisualConfigOptions): PlaywrightTestConfig
