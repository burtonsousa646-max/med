import type { StorybookConfig } from '@storybook/react-vite'

/** Настройка Storybook пакета: stories из src/**, сборка без Module Federation, телеметрия выключена. Только для .storybook/main.ts. */
export function defineStorybookConfig(overrides?: Partial<StorybookConfig>): StorybookConfig
