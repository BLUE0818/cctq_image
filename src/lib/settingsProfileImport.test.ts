import { describe, expect, it } from 'vitest'
import type { ApiProfile } from '../types'
import { DEFAULT_BASE_URL } from './apiProfiles'
import { createProfileImportUrl } from './settingsProfileImport'

const profile: ApiProfile = {
  id: 'profile',
  name: 'CCTQ',
  provider: 'openai',
  baseUrl: 'https://external.example.com/v1/',
  apiKey: 'secret-key',
  model: 'gpt-image-2-pro',
  timeout: 600,
  codexCli: true,
  apiProxy: false,
}

describe('profile import URL', () => {
  it('shares the selected profile through the fixed CCTQ URL without leaking the key by default', () => {
    const url = new URL(createProfileImportUrl('https://app.example.com/?old=value#section', profile, false))

    expect(url.origin + url.pathname).toBe('https://app.example.com/')
    expect(url.hash).toBe('')
    expect(url.searchParams.get('apiUrl')).toBe(DEFAULT_BASE_URL)
    expect(url.searchParams.get('apiKey')).toBeNull()
    expect(url.searchParams.get('model')).toBe('gpt-image-2')
    expect(url.searchParams.get('codexCli')).toBe('true')
    expect(url.searchParams.get('settings')).toBeNull()
  })

  it('includes the API key only after explicit confirmation', () => {
    const url = new URL(createProfileImportUrl('https://app.example.com/', profile, true))
    expect(url.searchParams.get('apiKey')).toBe('secret-key')
  })
})
