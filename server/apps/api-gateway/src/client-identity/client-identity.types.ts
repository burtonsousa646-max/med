import type { Request } from 'express'

/** Содержит подтверждённый идентификатор пользователя. */
export interface VerifiedUser {
  realm: string
  subject: string
}

/** Порт получения подтверждённой идентичности для ограничения запросов. */
export interface VerifiedIdentityReader {
  /** Получает подтверждённую идентичность из доверенного источника. */
  read(request: Request): Promise<VerifiedUser | undefined>
}

/** Объединяет канонический адрес и подтверждённого пользователя. */
export interface ClientIdentity {
  canonicalIp: string
  verifiedUser?: VerifiedUser
}

/** Хранит канонический IP-адрес и его байтовое представление. */
export interface Ip {
  address: string
  bytes: number[]
}
