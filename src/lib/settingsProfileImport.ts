import { normalizeBaseUrl } from './api'
import { DEFAULT_SETTINGS, normalizeImageModel } from './apiProfiles'
import type { ApiProfile, CustomProviderDefinition } from '../types'

export function createProfileImportUrl(
  pageUrl: string,
  profile: ApiProfile,
  customProviders: CustomProviderDefinition[],
  includeApiKey: boolean,
) {
  const url = new URL(pageUrl)
  url.search = ''
  url.hash = ''

  if (profile.provider === 'openai') {
    url.searchParams.set('apiUrl', normalizeBaseUrl(profile.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl))
    if (includeApiKey && profile.apiKey.trim()) url.searchParams.set('apiKey', profile.apiKey.trim())
    url.searchParams.set('model', normalizeImageModel(profile.model))
    if (profile.codexCli) url.searchParams.set('codexCli', 'true')
    return url.toString()
  }

  const provider = customProviders.find((item) => item.id === profile.provider)
  url.searchParams.set('settings', JSON.stringify({
    customProviders: provider ? [provider] : [],
    profiles: [{ ...profile, apiKey: includeApiKey ? profile.apiKey : '' }],
  }))
  return url.toString()
}
