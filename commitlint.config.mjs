// Правила сообщений коммитов — ai/rules/common.md, раздел «Коммиты».
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'refactor',
        'perf',
        'test',
        'docs',
        'spec',
        'contract',
        'build',
        'ci',
        'chore',
      ],
    ],
    'header-max-length': [2, 'always', 72],
    'subject-full-stop': [2, 'never', '.'],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
  },
}
