import { lazy, type ComponentType } from 'react'

/** Оборачивает named-export страницу в React.lazy без ручного написания .then() на каждый импорт. */
export function lazyPage<T extends Record<string, ComponentType>>(
  loader: () => Promise<T>,
  name: Extract<keyof T, string>,
) {
  return lazy(() => loader().then((mod) => ({ default: mod[name] })))
}
