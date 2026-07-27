import type { ApiProfile, AppSettings } from '../types'
import {
  createDefaultOpenAIProfile,
  DEFAULT_IMAGES_MODEL,
  findEquivalentApiProfile,
  mergeImportedSettings,
  normalizeApiProfile,
  normalizeImageModel,
  normalizeSettings,
} from './apiProfiles'

const URL_SETTING_KEYS = ['settings', 'apiUrl', 'apiKey', 'codexCli', 'model']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isOpenAIProfileInput(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (value.provider == null || value.provider === 'openai')
}

function getProfileDedupKey(profile: Pick<ApiProfile, 'apiKey' | 'model'>) {
  return JSON.stringify([profile.apiKey.trim(), profile.model.trim()])
}

function createUrlProfileId(usedIds: Set<string>) {
  let id = `openai-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  while (usedIds.has(id)) {
    id = `openai-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  }
  return id
}

function pickUrlSettingsPayload(value: unknown): unknown | null {
  if (!isRecord(value)) return null
  return { profiles: value.profiles }
}

function getUrlSettingsPayload(searchParams: URLSearchParams): unknown | null {
  const raw = searchParams.get('settings')
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (isRecord(parsed) && 'settings' in parsed) {
      return pickUrlSettingsPayload(parsed.settings)
    }
    return pickUrlSettingsPayload(parsed)
  } catch {
    return null
  }
}

function getFirstImportableProfile(importedSettings: unknown): ApiProfile | null {
  if (!isRecord(importedSettings) || !Array.isArray(importedSettings.profiles)) return null
  const profile = importedSettings.profiles.find(isOpenAIProfileInput)
  return profile ? normalizeApiProfile(profile) : null
}

function activateFirstImportedProfile(settings: AppSettings, importedSettings: unknown): AppSettings {
  const importedProfile = getFirstImportableProfile(importedSettings)
  if (!importedProfile) return settings
  const activeProfile = findEquivalentApiProfile(settings, importedProfile)
  return activeProfile
    ? normalizeSettings({ ...settings, activeProfileId: activeProfile.id })
    : settings
}

export function hasUrlSettingParams(searchParams: URLSearchParams) {
  return URL_SETTING_KEYS.some((key) => searchParams.has(key))
}


export function clearUrlSettingParams(searchParams: URLSearchParams) {
  for (const key of URL_SETTING_KEYS) searchParams.delete(key)
}

export function buildSettingsFromUrlParams(currentSettings: Partial<AppSettings> | unknown, searchParams: URLSearchParams): Partial<AppSettings> {
  const importedSettings = getUrlSettingsPayload(searchParams)
  const apiKeyParam = searchParams.get('apiKey')
  const codexCliParam = searchParams.get('codexCli')
  const modelParam = searchParams.get('model')
  const hasProfileParams = apiKeyParam !== null || codexCliParam !== null || modelParam !== null
  const settings = importedSettings == null
    ? normalizeSettings(currentSettings)
    : activateFirstImportedProfile(mergeImportedSettings(currentSettings, importedSettings), importedSettings)

  // apiUrl remains a recognized cleanup key for old shared links, but it can no longer affect requests.
  if (hasProfileParams) {
    const profile = createDefaultOpenAIProfile({
      id: createUrlProfileId(new Set(settings.profiles.map((item) => item.id))),
      name: 'URL 参数配置',
      model: DEFAULT_IMAGES_MODEL,
      apiProxy: false,
    })
    if (apiKeyParam !== null) profile.apiKey = apiKeyParam.trim()
    if (modelParam !== null) profile.model = normalizeImageModel(modelParam)
    if (codexCliParam !== null) profile.codexCli = codexCliParam.trim().toLowerCase() === 'true'

    const existingProfile = settings.profiles.find((item) => getProfileDedupKey(item) === getProfileDedupKey(profile))
    if (existingProfile) {
      return normalizeSettings({ ...settings, activeProfileId: existingProfile.id })
    }

    return normalizeSettings({
      ...settings,
      profiles: [...settings.profiles, profile],
      activeProfileId: profile.id,
    })
  }

  return importedSettings == null ? {} : settings
}
