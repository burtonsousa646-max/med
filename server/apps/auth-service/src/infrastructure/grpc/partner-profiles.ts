import { ClientGrpcProxy } from '@nestjs/microservices'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'
import type { PartnersServiceClient } from '@platform/contracts/partners/v1/partners'
import { firstValueFrom, timeout } from 'rxjs'
import type { PartnerProfiles } from '../../application/ports'

/** Адаптер единственной операции Partners, используемой при первом входе. */
export class GrpcPartnerProfiles implements PartnerProfiles {
  private readonly proxy: ClientGrpcProxy
  private readonly client: PartnersServiceClient

  constructor(
    target: string,
    private readonly timeoutMs: number,
  ) {
    this.proxy = new ClientGrpcProxy({
      url: target,
      package: 'platform.partners.v1',
      protoPath: protoPath('partners/v1/partners.proto'),
      loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs] },
    })
    this.client = this.proxy.getService<PartnersServiceClient>('PartnersService')
  }

  async ensure(registrationId: string, verifiedEmail: string): Promise<string> {
    const response = await firstValueFrom(
      this.client
        .ensureUserProfile({ registrationId, verifiedEmail })
        .pipe(timeout(this.timeoutMs)),
    )
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(response.userId))
      throw new Error('Partners вернул неверный идентификатор профиля')
    return response.userId
  }

  onModuleDestroy() {
    this.proxy.close()
  }
}
