import { normalizeBaseUrl } from './api'
import { DEFAULT_SETTINGS, normalizeImageModel } from './apiProfiles'
import type { ApiProfile } from '../types'

export function createProfileImportUrl(
  pageUrl: string,
  profile: ApiProfile,
  includeApiKey: boolean,
) {
  const url = new URL(pageUrl)
  url.search = ''
  url.hash = ''

  url.searchParams.set('apiUrl', normalizeBaseUrl(DEFAULT_SETTINGS.baseUrl))
  if (includeApiKey && profile.apiKey.trim()) url.searchParams.set('apiKey', profile.apiKey.trim())
  url.searchParams.set('model', normalizeImageModel(profile.model))
  if (profile.codexCli) url.searchParams.set('codexCli', 'true')
  return url.toString()
}
