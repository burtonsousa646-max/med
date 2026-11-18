// Node.js ESM требует явный файл: после tsc дополняем относительные импорты каталогов.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'

/** Обрабатывает только файлы сборки; внешние пакеты и импорты файлов не меняет. */
async function resolveDirectoryImports(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) {
      await resolveDirectoryImports(file)
    } else if (entry.isFile() && file.endsWith('.js')) {
      await rewriteFile(file)
    }
  }
}

/** Заменяет спецификатор каталога на index.js по фактическому содержимому dist. */
async function rewriteFile(file) {
  const source = await readFile(file, 'utf8')
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const edits = []

  async function inspect(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const target = resolve(dirname(file), specifier)
        const info = await stat(target).catch((error) => {
          if (error.code === 'ENOENT') return undefined
          throw error
        })
        if (info?.isDirectory()) {
          const index = await stat(join(target, 'index.js')).catch((error) => {
            if (error.code === 'ENOENT') return undefined
            throw error
          })
          if (!index?.isFile()) throw new Error(`Не найден index.js для ${specifier} в ${file}`)
          edits.push({
            start: node.moduleSpecifier.getStart(parsed) + 1,
            end: node.moduleSpecifier.end - 1,
            value: `${specifier}/index.js`,
          })
        }
      }
    }
  }

  for (const statement of parsed.statements) await inspect(statement)
  if (!edits.length) return
  let result = source
  for (const edit of edits.reverse())
    result = result.slice(0, edit.start) + edit.value + result.slice(edit.end)
  await writeFile(file, result)
}

const outputDirectory = resolve(process.argv[2] ?? 'dist')
await resolveDirectoryImports(outputDirectory)
