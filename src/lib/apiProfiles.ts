import type { ApiProfile, AppSettings } from '../types'
import { DEFAULT_ZIP_DOWNLOAD_ROUTES, ZIP_DOWNLOAD_ROUTE_VALUES } from '../types'

export const DEFAULT_BASE_URL = 'https://www.cctq.ai/v1'
export const IMAGE_MODEL_OPTIONS = ['gpt-image-2'] as const
export const DEFAULT_IMAGES_MODEL = 'gpt-image-2'
export const DEFAULT_OPENAI_PROFILE_ID = 'default-openai'
export const DEFAULT_API_TIMEOUT = 600
export const DEFAULT_CODEX_CLI = true

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isOpenAIProfileInput(value: unknown): boolean {
  if (!isRecord(value)) return false
  return value.provider == null || value.provider === 'openai'
}

export function normalizeImageModel(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_IMAGES_MODEL
  const model = value.trim()
  return IMAGE_MODEL_OPTIONS.some((option) => option === model) ? model : DEFAULT_IMAGES_MODEL
}

export function createDefaultOpenAIProfile(overrides: Partial<ApiProfile> = {}): ApiProfile {
  return {
    id: DEFAULT_OPENAI_PROFILE_ID,
    name: '默认',
    apiKey: '',
    timeout: DEFAULT_API_TIMEOUT,
    apiProxy: false,
    ...overrides,
    model: normalizeImageModel(overrides.model),
    codexCli: DEFAULT_CODEX_CLI,
    provider: 'openai',
    baseUrl: DEFAULT_BASE_URL,
  }
}

export function normalizeApiProfile(input: unknown, fallback?: Partial<ApiProfile>): ApiProfile {
  const record = isRecord(input) ? input : {}
  const defaults = createDefaultOpenAIProfile(fallback)
  return createDefaultOpenAIProfile({
    ...defaults,
    id: typeof record.id === 'string' && record.id.trim() ? record.id : defaults.id,
    name: typeof record.name === 'string' && record.name.trim() ? record.name : defaults.name,
    apiKey: typeof record.apiKey === 'string' ? record.apiKey : defaults.apiKey,
    model: normalizeImageModel(record.model ?? defaults.model),
    timeout: typeof record.timeout === 'number' && Number.isFinite(record.timeout) ? record.timeout : defaults.timeout,
    codexCli: DEFAULT_CODEX_CLI,
    apiProxy: typeof record.apiProxy === 'boolean' ? record.apiProxy : defaults.apiProxy,
  })
}

function normalizeZipDownloadRoutes(value: unknown) {
  if (!Array.isArray(value)) return [...DEFAULT_ZIP_DOWNLOAD_ROUTES]
  const allowed = new Set<string>(ZIP_DOWNLOAD_ROUTE_VALUES)
  return value.filter((item): item is typeof ZIP_DOWNLOAD_ROUTE_VALUES[number] =>
    typeof item === 'string' && allowed.has(item),
  )
}

export function normalizeSettings(input: Partial<AppSettings> | unknown): AppSettings {
  const record = isRecord(input) ? input : {}
  const rawProfiles = Array.isArray(record.profiles) ? record.profiles : []
  const hasLegacyCustomProviders = Array.isArray(record.customProviders) && record.customProviders.length > 0
  const profiles = rawProfiles.length > 0
    ? rawProfiles.filter(isOpenAIProfileInput).map((profile) => normalizeApiProfile(profile))
    : [createDefaultOpenAIProfile({
        apiKey: !hasLegacyCustomProviders && typeof record.apiKey === 'string' ? record.apiKey : '',
        model: !hasLegacyCustomProviders ? normalizeImageModel(record.model) : DEFAULT_IMAGES_MODEL,
        timeout: !hasLegacyCustomProviders && typeof record.timeout === 'number' && Number.isFinite(record.timeout) ? record.timeout : DEFAULT_API_TIMEOUT,
        codexCli: DEFAULT_CODEX_CLI,
        apiProxy: !hasLegacyCustomProviders && Boolean(record.apiProxy),
      })]
  const safeProfiles = profiles.length ? profiles : [createDefaultOpenAIProfile()]
  const activeProfileId = typeof record.activeProfileId === 'string' && safeProfiles.some((profile) => profile.id === record.activeProfileId)
    ? record.activeProfileId
    : safeProfiles[0].id
  const active = safeProfiles.find((profile) => profile.id === activeProfileId) ?? safeProfiles[0]

  return {
    baseUrl: DEFAULT_BASE_URL,
    apiKey: active.apiKey,
    model: active.model,
    timeout: active.timeout,
    codexCli: active.codexCli,
    apiProxy: active.apiProxy,
    clearInputAfterSubmit: typeof record.clearInputAfterSubmit === 'boolean' ? record.clearInputAfterSubmit : false,
    persistInputOnRestart: typeof record.persistInputOnRestart === 'boolean' ? record.persistInputOnRestart : true,
    reuseTaskApiProfileTemporarily: typeof record.reuseTaskApiProfileTemporarily === 'boolean' ? record.reuseTaskApiProfileTemporarily : false,
    alwaysShowRetryButton: typeof record.alwaysShowRetryButton === 'boolean' ? record.alwaysShowRetryButton : false,
    enterSubmit: typeof record.enterSubmit === 'boolean' ? record.enterSubmit : false,
    zipDownloadRoutes: normalizeZipDownloadRoutes(record.zipDownloadRoutes),
    profiles: safeProfiles,
    activeProfileId,
  }
}

export function getActiveApiProfile(settings: Partial<AppSettings> | unknown): ApiProfile {
  const record = isRecord(settings) ? settings : {}
  const normalized = normalizeSettings(settings)
  const profile = normalized.profiles.find((item) => item.id === normalized.activeProfileId)
    ?? normalized.profiles[0]
    ?? createDefaultOpenAIProfile()
  const rawProfiles = Array.isArray(record.profiles) ? record.profiles : []
  const rawActiveProfile = typeof record.activeProfileId === 'string'
    ? rawProfiles.find((item) => isRecord(item) && item.id === record.activeProfileId)
    : undefined
  const hasLegacyCustomProviders = Array.isArray(record.customProviders) && record.customProviders.length > 0
  const useLegacyTopLevelFields = (rawProfiles.length === 0 && !hasLegacyCustomProviders) ||
    Boolean(rawActiveProfile && isOpenAIProfileInput(rawActiveProfile))
  return createDefaultOpenAIProfile({
    ...profile,
    apiKey: useLegacyTopLevelFields && typeof record.apiKey === 'string' ? record.apiKey : profile.apiKey,
    model: normalizeImageModel(useLegacyTopLevelFields ? record.model ?? profile.model : profile.model),
    timeout: useLegacyTopLevelFields && typeof record.timeout === 'number' && Number.isFinite(record.timeout) ? record.timeout : profile.timeout,
    codexCli: DEFAULT_CODEX_CLI,
    apiProxy: useLegacyTopLevelFields && typeof record.apiProxy === 'boolean' ? record.apiProxy : profile.apiProxy,
  })
}

export function validateApiProfile(profile: ApiProfile): string | null {
  if (!profile.name.trim()) return '缺少名称'
  if (!profile.apiKey.trim()) return '缺少 API Key'
  if (!profile.model.trim()) return '缺少模型 ID'
  return null
}

function isDefaultOpenAIProfile(profile: ApiProfile): boolean {
  return profile.id === DEFAULT_OPENAI_PROFILE_ID &&
    profile.name === '默认' &&
    profile.provider === 'openai' &&
    profile.baseUrl === DEFAULT_BASE_URL &&
    profile.apiKey === '' &&
    profile.model === DEFAULT_IMAGES_MODEL &&
    profile.timeout === DEFAULT_API_TIMEOUT &&
    profile.codexCli === DEFAULT_CODEX_CLI &&
    profile.apiProxy === false
}

function hasOnlyDefaultProfiles(settings: AppSettings): boolean {
  return settings.profiles.length === 1 &&
    settings.activeProfileId === DEFAULT_OPENAI_PROFILE_ID &&
    isDefaultOpenAIProfile(settings.profiles[0])
}

function createImportedProfileId(usedIds: Set<string>): string {
  let id = `openai-imported-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  while (usedIds.has(id)) {
    id = `openai-imported-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  }
  usedIds.add(id)
  return id
}

function getApiProfileDedupKey(profile: ApiProfile): string {
  return JSON.stringify([profile.apiKey.trim(), profile.model.trim()])
}

function getApiProfileConnectionKey(profile: ApiProfile): string {
  return JSON.stringify([profile.model.trim()])
}

function hasEquivalentApiProfile(existingProfiles: ApiProfile[], importedProfile: ApiProfile): boolean {
  const dedupKey = getApiProfileDedupKey(importedProfile)
  if (existingProfiles.some((profile) => getApiProfileDedupKey(profile) === dedupKey)) return true
  if (importedProfile.apiKey.trim()) return false
  const connectionKey = getApiProfileConnectionKey(importedProfile)
  return existingProfiles.some((profile) => getApiProfileConnectionKey(profile) === connectionKey)
}

function getImportableProfiles(input: unknown): ApiProfile[] {
  if (!isRecord(input)) return []
  if (Array.isArray(input.profiles)) {
    return input.profiles.filter(isOpenAIProfileInput).map((profile) => normalizeApiProfile(profile))
  }
  return [normalizeSettings(input).profiles[0]]
}

export function findEquivalentApiProfile(
  settings: Partial<AppSettings> | unknown,
  importedProfile: ApiProfile,
): ApiProfile | null {
  const normalized = normalizeSettings(settings)
  const profile = normalizeApiProfile(importedProfile)
  const exact = normalized.profiles.find((item) => getApiProfileDedupKey(item) === getApiProfileDedupKey(profile))
  if (exact) return exact
  if (profile.apiKey.trim()) return null
  return normalized.profiles.find((item) =>
    getApiProfileConnectionKey(item) === getApiProfileConnectionKey(profile),
  ) ?? null
}

export function mergeImportedSettings(
  currentSettings: Partial<AppSettings> | unknown,
  importedSettings: Partial<AppSettings> | unknown,
): AppSettings {
  const current = normalizeSettings(currentSettings)
  const importableProfiles = getImportableProfiles(importedSettings)
  if (!importableProfiles.length) return current
  const imported = normalizeSettings({ ...(isRecord(importedSettings) ? importedSettings : {}), profiles: importableProfiles })
  if (hasOnlyDefaultProfiles(current)) return imported

  const usedIds = new Set(current.profiles.map((profile) => profile.id))
  const existingKeys = new Set(current.profiles.map(getApiProfileDedupKey))
  const importedProfiles = imported.profiles
    .filter((profile) => !existingKeys.has(getApiProfileDedupKey(profile)) && !hasEquivalentApiProfile(current.profiles, profile))
    .map((profile) => ({ ...profile, id: createImportedProfileId(usedIds) }))
  return normalizeSettings({
    ...current,
    profiles: [...current.profiles, ...importedProfiles],
    activeProfileId: current.activeProfileId,
  })
}

export const DEFAULT_SETTINGS: AppSettings = normalizeSettings({
  apiKey: '',
  model: DEFAULT_IMAGES_MODEL,
  timeout: DEFAULT_API_TIMEOUT,
  codexCli: DEFAULT_CODEX_CLI,
  apiProxy: false,
  clearInputAfterSubmit: false,
  persistInputOnRestart: true,
  reuseTaskApiProfileTemporarily: false,
  alwaysShowRetryButton: false,
  enterSubmit: false,
  zipDownloadRoutes: DEFAULT_ZIP_DOWNLOAD_ROUTES,
})
