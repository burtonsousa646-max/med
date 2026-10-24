import type { DemoIdentity } from '@/types/session'
import type { Role } from '@/types/session'
import { ForbiddenActionError } from './types/common'

/**
 * Матрица прав. SOURCE: MED_HANDOFF/12_ROLES_PERMISSIONS.md.
 * Это демонстрационная проверка на клиенте — в реальной системе сервер обязан
 * повторить те же проверки (см. "UI скрытие кнопки не authorization").
 */
export type Capability =
  | 'partner.editProfile'
  | 'partner.submitForCheck'
  | 'documents.accept'
  | 'team.manage'
  | 'offers.edit'
  | 'offers.submitForModeration'
  | 'offers.codesManage'
  | 'campaign.create'
  | 'orders.transition'
  | 'orders.requestRefund'
  | 'settlement.view'
  | 'settlement.raiseDiscrepancy'
  | 'integration.configure'
  | 'support.respond'
  | 'admin.checkPartner'
  | 'admin.moderateOffer'
  | 'admin.approveSettlement'

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  owner: [
    'partner.editProfile',
    'partner.submitForCheck',
    'documents.accept',
    'team.manage',
    'offers.edit',
    'offers.submitForModeration',
    'offers.codesManage',
    'campaign.create',
    'orders.transition',
    'orders.requestRefund',
    'settlement.view',
    'settlement.raiseDiscrepancy',
    'integration.configure',
    'support.respond',
  ],
  offer_editor: ['offers.edit', 'offers.submitForModeration', 'offers.codesManage', 'campaign.create', 'support.respond'],
  orders_ops: ['orders.transition', 'support.respond'],
  finance: ['settlement.view', 'settlement.raiseDiscrepancy', 'orders.requestRefund', 'support.respond'],
  developer: ['integration.configure'],
  viewer: [],
  kam: ['admin.checkPartner', 'support.respond'],
  moderator: ['admin.moderateOffer'],
  finance_internal: ['admin.approveSettlement'],
  compliance: ['admin.checkPartner'],
}

export function can(identity: DemoIdentity | null, capability: Capability): boolean {
  if (!identity) return false
  return ROLE_CAPABILITIES[identity.role]?.includes(capability) ?? false
}

/** Бросает ForbiddenActionError, если у идентичности нет нужной capability —
 *  используется mock-api ресурсами перед мутирующими вызовами. */
export function assertCan(identity: DemoIdentity | null, capability: Capability): void {
  if (!can(identity, capability)) {
    throw new ForbiddenActionError(capability)
  }
}
