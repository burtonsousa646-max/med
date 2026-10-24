import { SCHEMA_VERSION, type Database } from './schema'
import { buildSeedDatabase } from './seed'

const STORAGE_KEY = 'med-cabinet-db-v1'

function loadFromStorage(): Database | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Database
    if (parsed.schemaVersion !== SCHEMA_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function saveToStorage(db: Database): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — демо продолжает работать в памяти.
  }
}

/** Тексты документов — контент, а не пользовательские данные: подтягиваем актуальную
 *  редакцию в уже сохранённую базу, не сбрасывая партнёров и акцепты. */
function refreshDocumentTexts(stored: Database): Database {
  const fresh = buildSeedDatabase().documentVersions
  for (const doc of stored.documentVersions) {
    const latest = fresh.find((d) => d.id === doc.id)
    if (latest) {
      doc.title = latest.title
      doc.contentSummary = latest.contentSummary
      doc.fullText = latest.fullText
    }
  }
  return stored
}

export function loadOrSeedDatabase(): Database {
  const stored = loadFromStorage()
  return stored ? refreshDocumentTexts(stored) : buildSeedDatabase()
}

export function reseedDatabase(): Database {
  const fresh = buildSeedDatabase()
  saveToStorage(fresh)
  return fresh
}
