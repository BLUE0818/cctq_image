import { describe, expect, it } from 'vitest'
import {
  createDefaultOpenAIProfile,
  DEFAULT_BASE_URL,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_SETTINGS,
  findEquivalentApiProfile,
  getActiveApiProfile,
  mergeImportedSettings,
  normalizeSettings,
} from './apiProfiles'

describe('CCTQ API profile normalization', () => {
  it('forces legacy and profile API URLs to the built-in CCTQ endpoint', () => {
    const settings = normalizeSettings({
      baseUrl: 'https://legacy.example.com/v1',
      apiKey: 'legacy-key',
      profiles: [{
        id: 'external-openai',
        name: 'External',
        provider: 'openai',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'profile-key',
        model: 'gpt-image-2-pro',
        timeout: 120,
        codexCli: false,
        apiProxy: false,
      }],
      activeProfileId: 'external-openai',
    })

    expect(settings.baseUrl).toBe(DEFAULT_BASE_URL)
    expect(settings.profiles[0].baseUrl).toBe(DEFAULT_BASE_URL)
    expect(settings.apiKey).toBe('profile-key')
  })

  it('migrates a legacy profile-less CCTQ configuration', () => {
    const settings = normalizeSettings({
      baseUrl: 'https://external.example.com/v1',
      apiKey: 'legacy-key',
      model: 'gpt-image-2-pro',
      timeout: 90,
      codexCli: true,
    })

    expect(settings.profiles[0]).toMatchObject({
      provider: 'openai',
      baseUrl: DEFAULT_BASE_URL,
      apiKey: 'legacy-key',
      model: DEFAULT_IMAGES_MODEL,
      timeout: 90,
      codexCli: true,
    })
  })

  it('drops legacy custom profiles without reusing their URL or API key', () => {
    const legacy = {
      baseUrl: 'https://custom.example.com/v1',
      apiKey: 'top-level-custom-key',
      profiles: [{
        id: 'custom-profile',
        name: 'Custom',
        provider: 'custom-provider',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'profile-custom-key',
        model: 'custom-model',
        timeout: 300,
        codexCli: false,
        apiProxy: false,
      }],
      activeProfileId: 'custom-profile',
    }
    const settings = normalizeSettings(legacy)
    const active = getActiveApiProfile(legacy)

    expect(settings.profiles).toHaveLength(1)
    expect(settings.profiles[0]).toMatchObject({
      provider: 'openai',
      baseUrl: DEFAULT_BASE_URL,
      apiKey: '',
      model: DEFAULT_IMAGES_MODEL,
      codexCli: true,
    })
    expect(active.apiKey).toBe('')
    expect(active.baseUrl).toBe(DEFAULT_BASE_URL)
  })

  it('does not reuse top-level credentials from legacy custom-provider data without profiles', () => {
    const legacy = {
      baseUrl: 'https://custom.example.com/v1',
      apiKey: 'custom-key',
      model: 'gpt-image-2-pro',
      codexCli: true,
      customProviders: [{ id: 'custom-provider', submit: { path: 'images/generations' } }],
    }
    const settings = normalizeSettings(legacy)
    const active = getActiveApiProfile(legacy)

    expect(settings.profiles[0]).toMatchObject({
      provider: 'openai',
      baseUrl: DEFAULT_BASE_URL,
      apiKey: '',
      model: DEFAULT_IMAGES_MODEL,
      codexCli: true,
    })
    expect(active.apiKey).toBe('')
  })

  it('keeps valid OpenAI profiles while filtering custom profiles', () => {
    const valid = createDefaultOpenAIProfile({ id: 'valid', apiKey: 'valid-key' })
    const settings = normalizeSettings({
      profiles: [
        { ...valid, baseUrl: 'https://external.example.com/v1' },
        { ...valid, id: 'custom', provider: 'custom-provider', apiKey: 'custom-key' },
      ],
      activeProfileId: 'custom',
    })

    expect(settings.profiles).toEqual([{ ...valid, baseUrl: DEFAULT_BASE_URL }])
    expect(settings.activeProfileId).toBe('valid')
  })

  it('does not reuse top-level custom credentials when a mixed legacy configuration had a custom profile active', () => {
    const valid = createDefaultOpenAIProfile({ id: 'valid', apiKey: 'valid-key' })
    const legacy = {
      apiKey: 'active-custom-key',
      model: 'gpt-image-2-pro',
      profiles: [
        valid,
        {
          ...valid,
          id: 'custom',
          provider: 'custom-provider',
          baseUrl: 'https://custom.example.com/v1',
          apiKey: 'active-custom-key',
        },
      ],
      activeProfileId: 'custom',
    }

    const settings = normalizeSettings(legacy)
    const active = getActiveApiProfile(legacy)

    expect(settings.activeProfileId).toBe('valid')
    expect(active.apiKey).toBe('valid-key')
    expect(active.model).toBe(DEFAULT_IMAGES_MODEL)
    expect(active.baseUrl).toBe(DEFAULT_BASE_URL)
  })

  it('does not reuse top-level credentials when a profiled configuration has an invalid active id', () => {
    const valid = createDefaultOpenAIProfile({ id: 'valid', apiKey: 'valid-key' })
    const legacy = {
      apiKey: 'unknown-active-key',
      model: 'gpt-image-2-pro',
      profiles: [valid],
      activeProfileId: 'missing',
    }

    const active = getActiveApiProfile(legacy)

    expect(active.apiKey).toBe('valid-key')
    expect(active.model).toBe(DEFAULT_IMAGES_MODEL)
    expect(active.baseUrl).toBe(DEFAULT_BASE_URL)
  })

  it('normalizes unsupported models to the built-in default', () => {
    const settings = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({ model: 'custom-model' })],
    })
    expect(settings.model).toBe(DEFAULT_IMAGES_MODEL)
    expect(settings.profiles[0].model).toBe(DEFAULT_IMAGES_MODEL)
  })

  it('forces Codex compatibility on when an older setting disabled it', () => {
    const settings = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({ id: 'legacy', codexCli: false })],
      activeProfileId: 'legacy',
      codexCli: false,
    })

    expect(settings.codexCli).toBe(true)
    expect(settings.profiles[0].codexCli).toBe(true)
  })

  it('migrates the removed Pro model to the default model', () => {
    const settings = normalizeSettings({
      profiles: [{
        id: 'legacy',
        name: 'Legacy',
        provider: 'openai',
        baseUrl: DEFAULT_BASE_URL,
        apiKey: 'legacy-key',
        model: 'gpt-image-2-pro',
        timeout: 600,
        codexCli: false,
        apiProxy: false,
      }],
      activeProfileId: 'legacy',
    })

    expect(settings.model).toBe(DEFAULT_IMAGES_MODEL)
    expect(settings.profiles[0].model).toBe(DEFAULT_IMAGES_MODEL)
  })
})

describe('CCTQ profile import', () => {
  it('imports OpenAI profiles but forces their URL to CCTQ', () => {
    const imported = mergeImportedSettings(DEFAULT_SETTINGS, {
      profiles: [{
        ...createDefaultOpenAIProfile({ id: 'imported', name: 'Imported', apiKey: 'imported-key' }),
        baseUrl: 'https://external.example.com/v1',
      }],
      activeProfileId: 'imported',
    })

    expect(imported.profiles).toHaveLength(1)
    expect(imported.profiles[0]).toMatchObject({
      id: 'imported',
      name: 'Imported',
      provider: 'openai',
      baseUrl: DEFAULT_BASE_URL,
      apiKey: 'imported-key',
    })
  })

  it('ignores imports containing only custom profiles', () => {
    const current = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({ id: 'current', apiKey: 'current-key' })],
      activeProfileId: 'current',
    })
    const merged = mergeImportedSettings(current, {
      customProviders: [{ id: 'custom-provider', submit: { path: 'images/generations' } }],
      profiles: [{
        id: 'custom',
        name: 'Custom',
        provider: 'custom-provider',
        baseUrl: 'https://custom.example.com/v1',
        apiKey: 'custom-key',
        model: 'custom-model',
        timeout: 300,
        codexCli: false,
        apiProxy: false,
      }],
    })

    expect(merged).toEqual(current)
  })

  it('finds equivalent keyless imports by model', () => {
    const current = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({ id: 'existing', apiKey: 'stored-key', model: 'gpt-image-2-pro' })],
      activeProfileId: 'existing',
    })
    const imported = createDefaultOpenAIProfile({ id: 'imported', apiKey: '', model: 'gpt-image-2-pro' })

    expect(findEquivalentApiProfile(current, imported)?.id).toBe('existing')
  })
})
