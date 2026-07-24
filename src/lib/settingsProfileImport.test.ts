import { describe, expect, it } from 'vitest'
import type { ApiProfile, CustomProviderDefinition } from '../types'
import { createProfileImportUrl } from './settingsProfileImport'

const openAIProfile: ApiProfile = {
  id: 'openai-profile',
  name: 'OpenAI',
  provider: 'openai',
  baseUrl: 'https://api.example.com/v1/',
  apiKey: 'secret-key',
  model: 'gpt-image-2',
  timeout: 600,
  codexCli: true,
  apiProxy: false,
}

const customProvider: CustomProviderDefinition = {
  id: 'custom-provider',
  name: 'Custom',
  submit: {
    path: 'images/generations',
    body: { prompt: '$prompt' },
    result: { imageUrlPaths: ['data.*.url'] },
  },
}

it('creates OpenAI profile URLs without leaking keys by default', () => {
  const url = new URL(createProfileImportUrl(
    'https://app.example.com/?old=value#section',
    openAIProfile,
    [],
    false,
  ))

  expect(url.origin + url.pathname).toBe('https://app.example.com/')
  expect(url.hash).toBe('')
  expect(url.searchParams.get('apiUrl')).toBe('https://api.example.com/v1')
  expect(url.searchParams.get('apiKey')).toBeNull()
  expect(url.searchParams.get('model')).toBe('gpt-image-2')
  expect(url.searchParams.get('codexCli')).toBe('true')
})

it('includes the API key only after explicit confirmation', () => {
  const url = new URL(createProfileImportUrl('https://app.example.com/', openAIProfile, [], true))
  expect(url.searchParams.get('apiKey')).toBe('secret-key')
})

it('embeds only the selected custom provider and profile', () => {
  const profile: ApiProfile = { ...openAIProfile, provider: customProvider.id }
  const url = new URL(createProfileImportUrl('https://app.example.com/', profile, [customProvider], false))
  const settings = JSON.parse(url.searchParams.get('settings') ?? '{}')

  expect(settings.customProviders).toEqual([customProvider])
  expect(settings.profiles).toEqual([{ ...profile, apiKey: '' }])
})
