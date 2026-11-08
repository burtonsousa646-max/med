// Линтер для всего репозитория. Запуск — `pnpm lint` из корня.
import js from '@eslint/js'
import eslintReact from '@eslint-react/eslint-plugin'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores([
    'prototype/',
    'docs/',
    '**/node_modules/',
    '**/dist/',
    '**/storybook-static/',
    '**/test-results/',
    '**/playwright-report/',
    '**/coverage/',
    '**/generated/',
    '**/*.gen.ts',
  ]),

  // Общие правила для всего кода
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },

  // JS-файлы конфигов — без проверок, которым нужны типы
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Визуальные тесты: функции в page.waitForFunction и page.evaluate выполняются в браузере
  {
    files: ['web/packages/config/visual/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // Frontend
  {
    files: ['web/**/*.{ts,tsx}'],
    extends: [
      eslintReact.configs['recommended-type-checked'],
      reactHooks.configs.flat['recommended-latest'],
    ],
    languageOptions: { globals: globals.browser },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // Backend: NestJS берёт зависимости из метаданных типов конструктора, поэтому
  // импорты классов нельзя автоматически превращать в `import type`.
  {
    files: ['server/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },

  // Тесты
  {
    files: ['**/*.{spec,test}.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Отключает правила, которые конфликтуют с Prettier. Всегда последним.
  prettier,
)
