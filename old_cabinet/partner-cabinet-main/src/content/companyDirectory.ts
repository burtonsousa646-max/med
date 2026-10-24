/** Демонстрационный «справочник организаций»: по ИНН подставляются реквизиты, как будто они
 *  найдены в реестре. Для демо подходит любой ИНН нужной длины — набор выбирается по цифрам. */

export interface DemoCompany {
  legalName: string
  kpp: string
  ogrn: string
  address: string
  signatoryName: string
  signatoryBasis: string
  contactEmail: string
  contactPhone: string
}

const COMPANIES: DemoCompany[] = [
  {
    legalName: 'ООО «Городская кофейня»',
    kpp: '770701001',
    ogrn: '1187746123456',
    address: 'г. Москва, ул. Лесная, д. 7, офис 24',
    signatoryName: 'Смирнова Анна Викторовна',
    signatoryBasis: 'Устав',
    contactEmail: 'partner@citycoffee.ru',
    contactPhone: '+74951202424',
  },
  {
    legalName: 'ООО «Новая среда»',
    kpp: '781301001',
    ogrn: '1217800126842',
    address: 'г. Санкт-Петербург, Каменноостровский проспект, д. 18',
    signatoryName: 'Орлов Михаил Андреевич',
    signatoryBasis: 'Устав',
    contactEmail: 'hello@novayasreda.ru',
    contactPhone: '+78126021818',
  },
  {
    legalName: 'ООО «Сфера Сервис»',
    kpp: '540601001',
    ogrn: '1205400039157',
    address: 'г. Новосибирск, Красный проспект, д. 55, офис 8',
    signatoryName: 'Кузнецова Елена Павловна',
    signatoryBasis: 'Устав',
    contactEmail: 'office@sferaservice.ru',
    contactPhone: '+73832095508',
  },
  {
    legalName: 'ООО «Точка вкуса»',
    kpp: '667101001',
    ogrn: '1196658034721',
    address: 'г. Екатеринбург, ул. Малышева, д. 36',
    signatoryName: 'Волков Дмитрий Сергеевич',
    signatoryBasis: 'Доверенность № 12/24',
    contactEmail: 'team@tochkavkusa.ru',
    contactPhone: '+73433103636',
  },
]

/** ИНН юрлица — 10 цифр, ИП — 12. */
export function isLookupReady(inn: string): boolean {
  return /^\d{10}$/.test(inn) || /^\d{12}$/.test(inn)
}

export function lookupCompanyByInn(inn: string): DemoCompany & { legalForm: 'ООО' | 'ИП' } {
  let hash = 0
  for (const digit of inn) hash = (hash * 31 + Number(digit)) >>> 0
  const company = COMPANIES[hash % COMPANIES.length]
  if (inn.length === 12) {
    const person = company.signatoryName
    return {
      ...company,
      legalForm: 'ИП',
      legalName: `ИП ${person}`,
      kpp: '',
      ogrn: `3${company.ogrn.slice(1, 13)}00`.slice(0, 15),
      signatoryBasis: 'Свидетельство о регистрации',
    }
  }
  return { ...company, legalForm: 'ООО' }
}
