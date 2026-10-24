import { loadOrSeedDatabase, reseedDatabase, saveToStorage } from './persistence'
import type { Database } from './schema'

export let db: Database = loadOrSeedDatabase()

/** Сохранить текущее состояние после мутации коллекции(й) базы. */
export function persist(): void {
  saveToStorage(db)
}

/** Сбросить демо-данные к детерминированному seed'у — используется кнопкой
 *  «Сбросить демо-данные» и тестами, которым нужно чистое состояние. */
export function resetDemoData(): Database {
  db = reseedDatabase()
  return db
}

export type { Database } from './schema'
