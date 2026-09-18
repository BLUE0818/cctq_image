import { describe, expect, it } from 'vitest'
import {
  createDefaultOpenAIProfile,
  DEFAULT_BASE_URL,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_SETTINGS,
  normalizeSettings,
} from './apiProfiles'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './urlSettings'

describe('URL settings params', () => {
  it('creates a CCTQ profile from API key, model, and Codex params', () => {
    const current = normalizeSettings(DEFAULT_SETTINGS)
    const next = normalizeSettings({
      ...current,
      ...buildSettingsFromUrlParams(current, new URLSearchParams('apiUrl=https://api.example.com/v1&apiKey=test-key&model=gpt-image-2-pro&codexCli=true')),
    })
    const active = next.profiles.find((profile) => profile.id === next.activeProfileId)

    expect(next.profiles).toHaveLength(2)
    expect(active).toMatchObject({
      name: 'URL 参数配置',
      provider: 'openai',
      baseUrl: DEFAULT_BASE_URL,
      apiKey: 'test-key',
      model: DEFAULT_IMAGES_MODEL,
      codexCli: true,
    })
  })

  it('ignores apiUrl when it is the only legacy parameter', () => {
    const current = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({ id: 'current', apiKey: 'current-key' })],
      activeProfileId: 'current',
    })
    const patch = buildSettingsFromUrlParams(current, new URLSearchParams('apiUrl=https://external.example.com/v1'))

    expect(patch).toEqual({})
    expect(normalizeSettings({ ...current, ...patch })).toEqual(current)
  })

  it('normalizes unsupported URL model values', () => {
    const next = normalizeSettings({
      ...DEFAULT_SETTINGS,
      ...buildSettingsFromUrlParams(DEFAULT_SETTINGS, new URLSearchParams('apiKey=test-key&model=custom-image-model')),
    })
    const active = next.profiles.find((profile) => profile.id === next.activeProfileId)

    expect(active).toMatchObject({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: 'test-key',
      model: DEFAULT_IMAGES_MODEL,
    })
  })

  it('reuses an equivalent existing CCTQ profile', () => {
    const existing = createDefaultOpenAIProfile({
      id: 'existing',
      apiKey: 'test-key',
      model: 'gpt-image-2-pro',
      codexCli: true,
    })
    const current = normalizeSettings({
      profiles: [createDefaultOpenAIProfile(), existing],
      activeProfileId: DEFAULT_SETTINGS.activeProfileId,
    })
    const next = normalizeSettings({
      ...current,
      ...buildSettingsFromUrlParams(current, new URLSearchParams('apiUrl=https://external.example.com/v1&apiKey=test-key&model=gpt-image-2-pro&codexCli=true')),
    })

    expect(next.profiles).toHaveLength(2)
    expect(next.activeProfileId).toBe(existing.id)
  })

  it('imports and activates the first valid OpenAI profile while forcing CCTQ URL', () => {
    const current = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({ id: 'current', apiKey: 'current-key' })],
      activeProfileId: 'current',
    })
    const params = new URLSearchParams()
    params.set('settings', JSON.stringify({
      profiles: [{
        ...createDefaultOpenAIProfile({ id: 'imported', name: 'Imported', apiKey: 'imported-key' }),
        baseUrl: 'https://external.example.com/v1',
      }],
    }))
    const next = normalizeSettings({ ...current, ...buildSettingsFromUrlParams(current, params) })

    expect(next.activeProfileId).not.toBe('current')
    expect(next.profiles.find((profile) => profile.id === next.activeProfileId)).toMatchObject({
      name: 'Imported',
      provider: 'openai',
      baseUrl: DEFAULT_BASE_URL,
      apiKey: 'imported-key',
    })
  })

  it('ignores settings payloads containing only custom profiles', () => {
    const current = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({ id: 'current', apiKey: 'current-key' })],
      activeProfileId: 'current',
    })
    const params = new URLSearchParams()
    params.set('settings', JSON.stringify({
      customProviders: [{ id: 'custom-provider', submit: { path: 'images/generations' } }],
      profiles: [{
        id: 'custom',
        name: 'Custom',
        provider: 'custom-provider',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'custom-key',
        model: 'custom-model',
        timeout: 300,
        codexCli: true,
        apiProxy: false,
      }],
    }))
    const next = normalizeSettings({ ...current, ...buildSettingsFromUrlParams(current, params) })

    expect(next).toEqual(current)
  })

  it('supports wrapped settings payloads without importing custom providers', () => {
    const params = new URLSearchParams()
    params.set('settings', JSON.stringify({
      version: 1,
      settings: {
        customProviders: [{ id: 'ignored', submit: { path: 'images/generations' } }],
        profiles: [
          { id: 'ignored-profile', provider: 'ignored', apiKey: 'ignored-key' },
          createDefaultOpenAIProfile({ id: 'wrapped', name: 'Wrapped', apiKey: 'wrapped-key' }),
        ],
      },
    }))
    const next = normalizeSettings({
      ...DEFAULT_SETTINGS,
      ...buildSettingsFromUrlParams(DEFAULT_SETTINGS, params),
    })

    expect(next.profiles).toHaveLength(1)
    expect(next.profiles[0]).toMatchObject({
      id: 'wrapped',
      provider: 'openai',
      baseUrl: DEFAULT_BASE_URL,
      apiKey: 'wrapped-key',
    })
  })

  it('clears known URL setting params without touching unrelated params', () => {
    const params = new URLSearchParams('apiUrl=https://api.example.com/v1&apiKey=test-key&model=test-model&foo=bar')

    expect(hasUrlSettingParams(params)).toBe(true)
    clearUrlSettingParams(params)
    expect(params.toString()).toBe('foo=bar')
  })
})
