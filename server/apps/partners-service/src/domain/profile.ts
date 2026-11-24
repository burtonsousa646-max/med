/** Причины отказа в операции над профилем, доступные прикладному слою. */
export class ProfileError extends Error {
  constructor(
    readonly reason:
      'invalid_input' | 'registration_conflict' | 'not_found' | 'invitation_required',
  ) {
    super(reason)
  }
}

/** Принимает UUID в канонической текстовой форме независимо от регистра. */
export function checkedId(value: string): string {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new ProfileError('invalid_input')
  }
  return value.toLowerCase()
}

/** Приводит подтверждённый Auth адрес к форме, используемой при повторе регистрации. */
export function registrationEmail(value: string): string {
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
    throw new ProfileError('invalid_input')
  }
  return value.toLowerCase()
}
