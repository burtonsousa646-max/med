import { z } from 'zod'
import { isInnShapeValid, isValidOgrn } from './inn'

export const registrationSchema = z.object({
  lastName: z.string().trim().min(1, 'Укажите фамилию'),
  firstName: z.string().trim().min(1, 'Укажите имя'),
  phone: z
    .string()
    .trim()
    .regex(/^\+7\d{10}$/, 'Формат: +7 и 10 цифр номера'),
  email: z.email('Некорректный email'),
  consent: z.literal(true, { message: 'Нужно согласие на обработку данных' }),
})

export type RegistrationFormValues = z.infer<typeof registrationSchema>

export const organizationSchema = z
  .object({
    legalForm: z.enum(['ООО', 'АО', 'ИП']),
    legalName: z.string().trim().min(3, 'Укажите полное наименование'),
    taxId: z.string().trim().min(10, 'Укажите ИНН'),
    kpp: z.string().trim().optional(),
    ogrn: z.string().trim().min(13, 'Укажите ОГРН/ОГРНИП'),
    address: z.string().trim().min(5, 'Укажите юридический адрес'),
    signatoryName: z.string().trim().min(3, 'Укажите ФИО подписанта'),
    signatoryBasis: z.string().trim().min(3, 'Укажите основание полномочий'),
    contactEmail: z.email('Некорректный email'),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\+7\d{10}$/, 'Формат: +7 и 10 цифр номера'),
  })
  .superRefine((values, ctx) => {
    if (!isInnShapeValid(values.taxId, values.legalForm)) {
      ctx.addIssue({
        code: 'custom',
        path: ['taxId'],
        message: values.legalForm === 'ИП' ? 'ИНН ИП состоит из 12 цифр' : 'ИНН организации состоит из 10 цифр',
      })
    }
    if (!isValidOgrn(values.ogrn, values.legalForm)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ogrn'],
        message: values.legalForm === 'ИП' ? 'ОГРНИП должен содержать 15 цифр' : 'ОГРН должен содержать 13 цифр',
      })
    }
  })

export type OrganizationFormValues = z.infer<typeof organizationSchema>

export const integrationQuestionnaireSchema = z.object({
  level: z.enum(['L0', 'L1', 'L2', 'L3']),
  connector: z.string().trim().min(2, 'Опишите способ обмена данными'),
  notes: z.string().trim().max(500),
})

export type IntegrationQuestionnaireValues = z.infer<typeof integrationQuestionnaireSchema>

export const offerDraftSchema = z
  .object({
    title: z.string().trim().min(3, 'Укажите название оффера').max(120),
    model: z.enum(['voucher', 'cpa', 'cps', 'subscription']),
    mechanic: z.enum(['coupon', 'promocode', 'subscription', 'service']),
    benefit: z.string().trim().min(3, 'Опишите выгоду для клиента'),
    description: z.string().trim().min(10, 'Добавьте описание не короче 10 символов'),
    couponPrice: z
      .string()
      .trim()
      .refine((v) => Number(v) >= 0 && v !== '', 'Цена не может быть отрицательной'),
    servicePrice: z
      .string()
      .trim()
      .refine((v) => Number(v) >= 0 && v !== '', 'Цена не может быть отрицательной'),
    region: z.string().trim().min(2, 'Укажите регион действия'),
    startDate: z.string().min(1, 'Укажите дату начала'),
    endDate: z.string().min(1, 'Укажите дату окончания'),
    usageRules: z.string().trim().min(3, 'Опишите условия использования'),
    refundRules: z.string().trim().min(3, 'Опишите условия возврата'),
    supportContact: z.email('Некорректный email поддержки'),
    commissionModel: z.enum(['CPA', 'CPS', 'RevShare']),
    iconDataUrl: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (new Date(values.startDate) >= new Date(values.endDate)) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Дата окончания должна быть позже даты начала' })
    }
  })

export type OfferDraftFormValues = z.infer<typeof offerDraftSchema>
