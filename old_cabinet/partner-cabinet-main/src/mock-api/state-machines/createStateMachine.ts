import { InvalidTransitionError } from '../types/common'

export type TransitionTable<TState extends string, TAction extends string> = Partial<
  Record<TState, Partial<Record<TAction, TState>>>
>

/**
 * Фабрика простой конечной стейт-машины с одной осью состояния.
 * Используется для partner/offer/integration/settlement lifecycle —
 * каждый определяет только таблицу переходов (SOURCE: MED_HANDOFF/08_STATE_MACHINES.md).
 */
export function createStateMachine<TState extends string, TAction extends string>(
  entityLabel: string,
  table: TransitionTable<TState, TAction>,
) {
  function canTransition(current: TState, action: TAction): boolean {
    return table[current]?.[action] !== undefined
  }

  function nextState(current: TState, action: TAction): TState {
    const next = table[current]?.[action]
    if (next === undefined) {
      throw new InvalidTransitionError(entityLabel, current, action)
    }
    return next
  }

  function allowedActions(current: TState): TAction[] {
    return Object.keys(table[current] ?? {}) as TAction[]
  }

  return { canTransition, nextState, allowedActions }
}
