import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { registrationSchema, type RegistrationFormValues } from '@/utils/validation/onboarding'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextField, CheckboxField } from '@/components/form/Field'

export function RegistrationPage() {
  const navigate = useNavigate()
  const setContact = useOnboardingStore((s) => s.setContact)
  const contact = useOnboardingStore((s) => s.contact)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: contact
      ? { ...contact, consent: true }
      : { lastName: '', firstName: '', phone: '+7', email: '', consent: undefined },
  })

  function onSubmit(values: RegistrationFormValues) {
    setContact(values)
    navigate('/onboarding/organization')
  }

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">Регистрация</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Контактные данные представителя, который будет вести подключение к платформе МЁД.
        </p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Фамилия" error={errors.lastName?.message} {...register('lastName')} />
          <TextField label="Имя" error={errors.firstName?.message} {...register('firstName')} />
        </div>
        <TextField
          label="Телефон"
          placeholder="+79991234567"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          label="Email"
          type="email"
          placeholder="name@company.ru"
          error={errors.email?.message}
          {...register('email')}
        />
        <CheckboxField
          label="Согласен на обработку персональных данных в целях подключения к платформе"
          error={errors.consent?.message}
          {...register('consent')}
        />
        <p className="text-caption text-bee-content-tertiary">
          Условия размещения офферов, комиссии и расчётов описаны в{' '}
          <a href="/offer" target="_blank" rel="noreferrer" className="text-bee-link-primary hover:underline">
            публичной оферте
          </a>
          . Принимается она позже, после проверки организации.
        </p>
        <div className="mt-2 flex justify-end">
          <Button type="submit" loading={isSubmitting}>
            Продолжить
          </Button>
        </div>
      </form>
    </Card>
  )
}
