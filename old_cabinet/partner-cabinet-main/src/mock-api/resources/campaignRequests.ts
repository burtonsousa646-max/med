import { db, persist } from '../db'
import { networkLatency, apiError } from '../client'
import type { CampaignRequest } from '../types'
import { logEvent } from './events'

export async function listCampaignRequests(partnerId: string): Promise<CampaignRequest[]> {
  await networkLatency()
  return db.campaignRequests
    .filter((c) => c.partnerId === partnerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export interface CreateCampaignRequestInput {
  partnerId: string
  offerVersionId: string
  offerTitle: string
  criteria: string
  desiredChannels: string[]
  desiredDates: string
}

export async function createCampaignRequest(input: CreateCampaignRequestInput): Promise<CampaignRequest> {
  await networkLatency()
  const request: CampaignRequest = {
    id: `camp-${crypto.randomUUID().slice(0, 8)}`,
    partnerId: input.partnerId,
    offerVersionId: input.offerVersionId,
    offerTitle: input.offerTitle,
    criteria: input.criteria,
    desiredChannels: input.desiredChannels,
    desiredDates: input.desiredDates,
    status: 'requested',
    createdAt: new Date().toISOString(),
  }
  db.campaignRequests.push(request)
  logEvent({
    type: 'campaign.requested',
    actorId: 'system',
    actorLabel: 'Партнёр',
    partnerId: input.partnerId,
    entityType: 'campaign_request',
    entityId: request.id,
    summary: `Заявка на продвижение «${input.offerTitle}» создана`,
  })
  persist()
  return request
}

export async function cancelCampaignRequest(id: string): Promise<CampaignRequest> {
  await networkLatency()
  const request = db.campaignRequests.find((c) => c.id === id)
  if (!request) throw apiError('NOT_FOUND', 'Заявка не найдена')
  request.status = 'cancelled'
  persist()
  return request
}
