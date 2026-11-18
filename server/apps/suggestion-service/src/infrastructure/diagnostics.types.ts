/**
 * Время последней записи категории и число событий, подавленных после неё.
 */
export interface DiagnosticCounter {
  at: number
  suppressed: number
}
