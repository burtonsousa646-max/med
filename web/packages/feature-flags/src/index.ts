// Feature toggles для web-приложений — ai/rules/frontend.md, раздел «Feature toggles», и ADR 0001.
//
// SDK Unleash в браузере нет: флаги приходят от gateway операцией getFeatureFlags.
// - host подключает <FeatureFlagsProvider load={…}> внутри QueryClientProvider
//   и после входа и выхода перезапрашивает флаги по featureFlagsQueryKey;
// - module читает флаг хуком useFeatureFlag<FeatureFlags>(FLAGS.x);
// - тесты задают флаги через <FeatureFlagsTestProvider flags={…}>.
export {
  FeatureFlagsProvider,
  featureFlagsQueryKey,
  type FeatureFlagsProviderProps,
} from './FeatureFlagsProvider'
export {
  FeatureFlagsTestProvider,
  type FeatureFlagsTestProviderProps,
} from './FeatureFlagsTestProvider'
export { useFeatureFlag } from './useFeatureFlag'
