import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as integrationsApi from '@/mock-api/resources/integrations'

export function useIntegration(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['integration', partnerId ?? 'none'],
    queryFn: () => integrationsApi.getIntegration(partnerId!),
    enabled: !!partnerId,
  })
}

export function useConfigureIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: integrationsApi.configureIntegration,
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['integration', data.partnerId] }),
  })
}

export function useSandboxRuns(integrationId: string | undefined) {
  return useQuery({
    queryKey: ['sandboxRuns', integrationId ?? 'none'],
    queryFn: () => integrationsApi.listSandboxRuns(integrationId!),
    enabled: !!integrationId,
  })
}

export function useStartSandboxTest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { integrationId: string; scenario: string }) =>
      integrationsApi.startSandboxTest(input.integrationId, input.scenario),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['sandboxRuns', data.integrationId] }),
  })
}

export function useCompleteSandboxTest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { runId: string; passed: boolean }) =>
      integrationsApi.completeSandboxTest(input.runId, input.passed),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['sandboxRuns', data.integrationId] }),
  })
}
