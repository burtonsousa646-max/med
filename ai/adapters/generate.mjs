// Генератор адаптеров ролей под Claude Code, Codex, Kimi Code и Gemini CLI.
// Источник правды — ai/agents/*.md. Адаптеры — тонкие обёртки: они велят агенту
// прочитать файл роли и его правила, а не копируют их текст.
//
//   pnpm ai:adapters          — сгенерировать адаптеры
//   pnpm ai:adapters:check    — проверить, что адаптеры совпадают с ролями
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const agentsDir = join(root, 'ai', 'agents')
const rulesDir = join(root, 'ai', 'rules')
const modelsFile = join(root, 'ai', 'config', 'models.yaml')
const check = process.argv.includes('--check')
const TIERS = ['reasoning', 'standard', 'fast']

const MARKER = 'Сгенерировано ai/adapters/generate.mjs'
const HEADER = `${MARKER} из ai/agents/{id}.md — не править руками.`

/** Читает поля id, name, description и список rules из frontmatter роли. */
function parseFrontmatter(text, file) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!match?.[1]) throw new Error(`${file}: нет frontmatter`)

  const fields = {}
  let list = null
  for (const line of match[1].split('\n')) {
    const item = /^ {2}- (.+?)\s*(#.*)?$/.exec(line)
    if (item && list) {
      list.push(item[1])
      continue
    }
    const field = /^([a-z_]+):\s*(.*)$/.exec(line)
    if (field) {
      const [, key, value] = field
      if (value === '') {
        list = []
        fields[key] = list
      } else {
        list = null
        fields[key] = value.replace(/\s+#.*$/, '')
      }
    }
  }

  for (const key of ['id', 'name', 'description', 'tier', 'rules']) {
    if (!fields[key]) throw new Error(`${file}: во frontmatter нет поля ${key}`)
  }
  if (!TIERS.includes(fields.tier)) {
    throw new Error(`${file}: tier должен быть одним из: ${TIERS.join(', ')}`)
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fields.id)) {
    throw new Error(`${file}: id должен быть в kebab-case латиницей`)
  }
  return fields
}

/** Читает ai/config/models.yaml: инструмент → уровень → модель. Пустое значение — модель по умолчанию. */
function parseModels(text) {
  const models = {}
  let tool = null
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '')
    if (line.trim() === '') continue
    const top = /^([a-z0-9-]+):\s*$/.exec(line)
    if (top) {
      tool = top[1]
      models[tool] = {}
      continue
    }
    const nested = /^ {2}([a-z]+):\s*(.*?)\s*$/.exec(line)
    if (!nested || !tool) throw new Error(`ai/config/models.yaml: не разобрать строку «${raw}»`)
    if (!TIERS.includes(nested[1]))
      throw new Error(`ai/config/models.yaml: неизвестный уровень ${nested[1]}`)
    models[tool][nested[1]] = nested[2]
  }
  return models
}

/** Текст обёртки, общий для всех инструментов. */
function body(agent, task) {
  const rules = agent.rules.map((rule) => `   - \`ai/rules/${rule}.md\``).join('\n')
  return `Ты работаешь в роли «${agent.name}» (\`${agent.id}\`) команды ИИ-агентов этого репозитория.

Перед началом работы:

1. Прочитай целиком \`ai/agents/${agent.id}.md\` — описание твоей роли: зона ответственности, порядок работы, права, запреты и формат отчёта.
2. Прочитай целиком правила роли:
${rules}
3. Работай строго по роли и правилам. Не делай работу других ролей и не меняй файлы вне путей из \`permissions.write\` роли.
4. Если для работы не хватает согласованных документов или нужно решение человека — остановись и спроси, как описано в роли.
5. Каждый коммит сначала покажи человеку и коммить только после согласования — \`ai/rules/common.md\`.

Задача от человека:

${task}

Если задача не указана — спроси, что нужно сделать.
`
}

function claudeCommand(agent, models) {
  const model = models['claude-code']?.[agent.tier]
  return `---
description: ${agent.name} — ${agent.description}
argument-hint: <задача>
disable-model-invocation: true
${model ? `model: ${model}\n` : ''}---

<!-- ${HEADER.replace('{id}', agent.id)} -->

${body(agent, '$ARGUMENTS')}`
}

function skill(agent) {
  return `---
name: ${agent.id}
description: Роль «${agent.name}» команды ИИ-агентов. ${agent.description} Используется только по явному вызову человеком.
---

<!-- ${HEADER.replace('{id}', agent.id)} -->

${body(agent, 'Текст, который человек написал после вызова этой роли.')}`
}

function codexPolicy(agent) {
  return `# ${HEADER.replace('{id}', agent.id)}
# Роль вызывается только явно: $${agent.id}
policy:
  allow_implicit_invocation: false
`
}

function geminiCommand(agent) {
  const prompt = body(agent, '{{args}}').replaceAll('\\', '\\\\').replaceAll('"""', '\\"\\"\\"')
  const description = `${agent.name} — ${agent.description}`.replaceAll('"', '\\"')
  return `# ${HEADER.replace('{id}', agent.id)}
description = "${description}"
prompt = """
${prompt}"""
`
}

/** Каталоги, которые генератор ведёт целиком. */
const outputs = [
  {
    dir: join(root, '.claude', 'commands'),
    files: (a, models) => [[`${a.id}.md`, claudeCommand(a, models)]],
  },
  {
    dir: join(root, '.agents', 'skills'),
    files: (a) => [
      [join(a.id, 'SKILL.md'), skill(a)],
      [join(a.id, 'agents', 'openai.yaml'), codexPolicy(a)],
    ],
  },
  { dir: join(root, '.gemini', 'commands'), files: (a) => [[`${a.id}.toml`, geminiCommand(a)]] },
]

async function listFiles(dir) {
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true })
    return entries
      .filter((e) => e.isFile())
      .map((e) => relative(dir, join(e.parentPath, e.name)))
      .sort()
  } catch {
    return []
  }
}

async function main() {
  const agentFiles = (await readdir(agentsDir)).filter((f) => f.endsWith('.md')).sort()
  const knownRules = new Set((await readdir(rulesDir)).map((f) => f.replace(/\.md$/, '')))
  const models = parseModels(await readFile(modelsFile, 'utf8'))

  const agents = []
  for (const file of agentFiles) {
    const agent = parseFrontmatter(await readFile(join(agentsDir, file), 'utf8'), file)
    if (`${agent.id}.md` !== file)
      throw new Error(`${file}: id «${agent.id}» не совпадает с именем файла`)
    for (const rule of agent.rules) {
      if (!knownRules.has(rule)) throw new Error(`${file}: правила ai/rules/${rule}.md нет`)
    }
    agents.push(agent)
  }

  const problems = []
  for (const { dir, files } of outputs) {
    const expected = new Map(agents.flatMap((a) => files(a, models)))
    const actual = await listFiles(dir)

    for (const [path, content] of expected) {
      const target = join(dir, path)
      const current = await readFile(target, 'utf8').catch(() => null)
      if (current === content) continue
      if (check) {
        problems.push(`${relative(root, target)}: ${current === null ? 'нет файла' : 'отличается'}`)
      } else {
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, content)
      }
    }

    // Удаляются только файлы, созданные генератором для ролей, которых больше нет.
    // Свои команды и навыки, добавленные вручную, генератор не трогает.
    for (const path of actual) {
      if (expected.has(path)) continue
      const content = await readFile(join(dir, path), 'utf8')
      if (!content.includes(MARKER)) continue
      if (check) problems.push(`${relative(root, join(dir, path))}: лишний файл`)
      else await rm(join(dir, path))
    }
  }

  if (problems.length > 0) {
    process.stderr.write(
      `Адаптеры не совпадают с ai/agents/. Запустите pnpm ai:adapters.\n${problems.map((p) => `  ${p}`).join('\n')}\n`,
    )
    process.exitCode = 1
    return
  }

  const ids = agents.map((a) => a.id).join(', ')
  process.stdout.write(check ? `Адаптеры актуальны: ${ids}\n` : `Адаптеры сгенерированы: ${ids}\n`)
}

await main()
