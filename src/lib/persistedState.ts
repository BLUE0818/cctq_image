import type { AppSettings, InputImage, TaskParams } from '../types'
import { normalizeSettings } from './apiProfiles'

interface PersistedStateSource {
  settings: AppSettings
  params: TaskParams
  prompt: string
  inputImages: InputImage[]
  dismissedCodexCliPrompts: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizePersistedInputImages(value: unknown): InputImage[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id) return []
    return [{ id: item.id, dataUrl: typeof item.dataUrl === 'string' ? item.dataUrl : '' }]
  })
}

export function encodePersistedState(state: PersistedStateSource) {
  const settings = normalizeSettings(state.settings)
  return {
    settings,
    params: state.params,
    ...(settings.persistInputOnRestart
      ? {
          prompt: state.prompt,
          inputImages: state.inputImages.map((image) => ({ id: image.id, dataUrl: '' })),
        }
      : {}),
    dismissedCodexCliPrompts: state.dismissedCodexCliPrompts,
  }
}

export function mergePersistedState<T extends PersistedStateSource>(persistedState: unknown, currentState: T): T {
  if (!isRecord(persistedState)) return currentState

  const settings = normalizeSettings(persistedState.settings ?? currentState.settings)
  const params = isRecord(persistedState.params) ? { ...currentState.params, ...persistedState.params } : currentState.params
  const dismissedCodexCliPrompts = Array.isArray(persistedState.dismissedCodexCliPrompts)
    ? persistedState.dismissedCodexCliPrompts.filter((item): item is string => typeof item === 'string')
    : currentState.dismissedCodexCliPrompts

  return {
    ...currentState,
    settings,
    params,
    dismissedCodexCliPrompts,
    prompt: settings.persistInputOnRestart && typeof persistedState.prompt === 'string' ? persistedState.prompt : '',
    inputImages: settings.persistInputOnRestart ? normalizePersistedInputImages(persistedState.inputImages) : [],
  }
}
