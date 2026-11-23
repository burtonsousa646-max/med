/** Текущее состояние одной проверки адреса. */
export interface EmailChallenge {
  id: string
  email: string
  sealedCode: string
  lastSentAt: Date
  expiresAt: Date
  attempts: number
  consumed: boolean
}

export type CodeResult = 'ok' | 'invalid_input' | 'invalid_code' | 'limited'
