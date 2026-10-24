import { createStateMachine } from './createStateMachine'
import type { IntegrationLifecycleStatus } from '../types/partner'

export type IntegrationAction =
  | 'configure'
  | 'start_test'
  | 'pass'
  | 'fail'
  | 'retry_configure'
  | 'activate'
  | 'degrade'
  | 'recover'
  | 'pause'
  | 'resume_testing'
  | 'resume_active'
  | 'revoke'

/** SOURCE: MED_HANDOFF/08_STATE_MACHINES.md — Integration
 * not_configured → configuring → testing → ready → active
 * testing → failed → configuring; active → degraded → active
 * active/degraded → paused → testing/active; любой рабочий status → revoked
 */
export const integrationLifecycle = createStateMachine<IntegrationLifecycleStatus, IntegrationAction>(
  'Интеграция',
  {
    not_configured: { configure: 'configuring' },
    configuring: { start_test: 'testing' },
    testing: { pass: 'ready', fail: 'failed' },
    failed: { retry_configure: 'configuring' },
    ready: { activate: 'active' },
    active: { degrade: 'degraded', pause: 'paused', revoke: 'revoked' },
    degraded: { recover: 'active', pause: 'paused', revoke: 'revoked' },
    paused: { resume_testing: 'testing', resume_active: 'active', revoke: 'revoked' },
    revoked: {},
  },
)
