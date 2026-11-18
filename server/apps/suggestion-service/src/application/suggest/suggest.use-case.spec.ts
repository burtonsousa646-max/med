import { expect, it, vi } from 'vitest'
import { SuggestUseCase } from './suggest.use-case.ts'
import {
  SourceUnavailableError,
  OperationCancelledError,
  type Suggestion,
} from '../../domain/suggestion'

/** Контекст без ограничения времени для сценариев, где проверяется поведение поиска. */
const context = () => ({ signal: new AbortController().signal, deadlineAtMs: Infinity })

/** Собирает изолированные порты и сценарий с предсказуемым источником из 12 вариантов. */
function setup() {
  const provider = {
    name: 'stub' as const,
    suggest: vi.fn(() =>
      Promise.resolve(Array.from({ length: 12 }, (_, i) => ({ value: `Вариант ${i}` }))),
    ),
  }
  const cache = {
    get: vi.fn<() => Promise<Suggestion[] | undefined>>(() => Promise.resolve(undefined)),
    set: vi.fn(() => Promise.resolve()),
  }
  const diagnostics = { record: vi.fn() }
  return {
    provider,
    cache,
    diagnostics,
    useCase: new SuggestUseCase(
      provider,
      cache,
      () => 'synthetic-key',
      86400,
      { nowMs: () => Date.now() },
      diagnostics,
    ),
  }
}

// Короткие строки завершаются до любых обращений к кешу и справочнику.
it('R5.1–R5.5: короткий ввод не читает кеш и источник', async () => {
  const { useCase, cache, provider } = setup()
  for (const query of ['', '  ', 'я', ' аб '])
    expect(await useCase.execute('party', query, context())).toEqual([])
  expect(cache.get).not.toHaveBeenCalled()
  expect(cache.set).not.toHaveBeenCalled()
  expect(provider.suggest).not.toHaveBeenCalled()
})

// Проверяем ограничение выдачи, порядок провайдера и TTL при сохранении результата.
it('R5.4/R9.6: сохраняет первые 10 в порядке источника с TTL 24 часа', async () => {
  const { useCase, cache } = setup()
  const items = await useCase.execute('party', 'пример', context())
  expect(items).toHaveLength(10)
  expect(items[0]?.value).toBe('Вариант 0')
  expect(items[9]?.value).toBe('Вариант 9')
  expect(cache.set).toHaveBeenCalledWith('synthetic-key', items, 86400, expect.any(AbortSignal))
})

// Ошибки необязательного кеша не мешают получить результат из источника.
it('R9.5: отказ чтения и записи кеша не отключает поиск', async () => {
  const { useCase, cache, provider } = setup()
  cache.get.mockRejectedValue(new Error('synthetic-cache-error'))
  cache.set.mockRejectedValue(new Error('synthetic-write-error'))
  expect(await useCase.execute('party', 'пример', context())).toHaveLength(10)
  expect(provider.suggest).toHaveBeenCalledOnce()
})

// Ошибка провайдера должна завершить запрос без повтора и без записи в кеш.
it('R9.1/R9.4: ошибка источника не кешируется и не повторяется', async () => {
  const { useCase, cache, provider } = setup()
  provider.suggest.mockRejectedValue(new SourceUnavailableError('quota'))
  await expect(useCase.execute('party', 'пример', context())).rejects.toThrow(
    SourceUnavailableError,
  )
  expect(provider.suggest).toHaveBeenCalledOnce()
  expect(cache.set).not.toHaveBeenCalled()
})

// Кеш-хит возвращается напрямую и не продлевает срок хранения.
it('R9.6: повторный запрос берётся из кеша без продления TTL', async () => {
  const { useCase, cache, provider } = setup()
  cache.get.mockResolvedValue([{ value: 'Из справочника' }])
  expect(await useCase.execute('party', 'пример', context())).toEqual([{ value: 'Из справочника' }])
  expect(provider.suggest).not.toHaveBeenCalled()
  expect(cache.set).not.toHaveBeenCalled()
})

// Отмена до начала поиска не должна запускать зависимые операции.
it('R9: отменённый поиск не отправляет новый запрос или запись', async () => {
  const { useCase, cache, provider } = setup()
  const controller = new AbortController()
  controller.abort()
  await expect(
    useCase.execute('party', 'пример', { signal: controller.signal, deadlineAtMs: Infinity }),
  ).rejects.toThrow(OperationCancelledError)
  expect(provider.suggest).not.toHaveBeenCalled()
  expect(cache.set).not.toHaveBeenCalled()
})
