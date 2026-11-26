/** Старые версии ключей остаются доступны для проверки повторов. */
export interface FingerprintKeys {
  readonly current: string
  readonly versions: ReadonlyMap<string, Buffer>
}

/** Резервирование отделяет право на внешний вызов от чтения уже начатой попытки. */
export type Reservation = { kind: 'reserved' | 'existing'; attemptId: string } | { kind: 'expired' }

/** Имена конфигураций не содержат секретов транспорта. */
export interface TransportRoute {
  transport: string
  senderConfig: string
}
