import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { DEFAULT_SETTINGS } from './apiProfiles'
import { encodePersistedState, mergePersistedState } from './persistedState'

const currentState = {
  settings: { ...DEFAULT_SETTINGS },
  params: { ...DEFAULT_PARAMS },
  prompt: '',
  inputImages: [] as Array<{ id: string; dataUrl: string }>,
  dismissedCodexCliPrompts: [] as string[],
  action: () => 'preserved',
}

describe('persistedState', () => {
  it('strips image payloads when restart input restore is enabled', () => {
    expect(encodePersistedState({
      ...currentState,
      prompt: 'draft',
      inputImages: [{ id: 'image-a', dataUrl: 'data:image/png;base64,a' }],
    })).toMatchObject({
      prompt: 'draft',
      inputImages: [{ id: 'image-a', dataUrl: '' }],
    })
  })

  it('omits draft input when restart restoration is disabled', () => {
    const persisted = encodePersistedState({
      ...currentState,
      settings: { ...DEFAULT_SETTINGS, persistInputOnRestart: false },
      prompt: 'draft',
      inputImages: [{ id: 'image-a', dataUrl: 'payload' }],
    })
    expect(persisted).not.toHaveProperty('prompt')
    expect(persisted).not.toHaveProperty('inputImages')
  })

  it('merges valid legacy data without replacing current methods', () => {
    const merged = mergePersistedState({
      settings: { ...DEFAULT_SETTINGS },
      params: { n: 3 },
      prompt: 'restored',
      inputImages: [
        { id: 'image-a', dataUrl: 123 },
        { id: 123, dataUrl: 'invalid' },
        null,
      ],
      dismissedCodexCliPrompts: ['a', 2, 'b'],
      action: 'malicious replacement',
    }, currentState)

    expect(merged.action()).toBe('preserved')
    expect(merged.params).toMatchObject({ ...DEFAULT_PARAMS, n: 3 })
    expect(merged.prompt).toBe('restored')
    expect(merged.inputImages).toEqual([{ id: 'image-a', dataUrl: '' }])
    expect(merged.dismissedCodexCliPrompts).toEqual(['a', 'b'])
  })

  it('clears stored drafts when the restored setting disables them', () => {
    const merged = mergePersistedState({
      settings: { ...DEFAULT_SETTINGS, persistInputOnRestart: false },
      prompt: 'stale',
      inputImages: [{ id: 'image-a', dataUrl: '' }],
    }, currentState)
    expect(merged.prompt).toBe('')
    expect(merged.inputImages).toEqual([])
  })

  it('migrates legacy Codex and Pro model settings during refresh', () => {
    const legacyProfile = {
      ...DEFAULT_SETTINGS.profiles[0],
      codexCli: false,
      model: 'gpt-image-2-pro',
    }
    const merged = mergePersistedState({
      settings: {
        ...DEFAULT_SETTINGS,
        codexCli: false,
        model: 'gpt-image-2-pro',
        profiles: [legacyProfile],
        activeProfileId: legacyProfile.id,
      },
    }, currentState)

    expect(merged.settings.codexCli).toBe(true)
    expect(merged.settings.model).toBe('gpt-image-2')
    expect(merged.settings.profiles[0]).toMatchObject({
      codexCli: true,
      model: 'gpt-image-2',
    })
  })
})
