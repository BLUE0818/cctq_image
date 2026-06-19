import { DEFAULT_PARAMS, type AppSettings, type TaskParams } from '../types'
import { getActiveApiProfile } from './apiProfiles'
import { normalizeImageSize } from './size'

export const DEFAULT_FAL_IMAGE_SIZE = '1360x1024'
export const MAX_OPENAI_OUTPUT_IMAGES = 10

export function getOutputImageLimitForSettings(settings: AppSettings) {
  return MAX_OPENAI_OUTPUT_IMAGES
}

export function normalizeParamsForSettings(
  params: TaskParams,
  settings: AppSettings,
  options: { hasInputImages?: boolean } = {},
): TaskParams {
  const activeProfile = getActiveApiProfile(settings)
  const outputImageLimit = getOutputImageLimitForSettings(settings)
  const nextParams: TaskParams = {
    ...params,
    size: normalizeImageSize(params.size) || DEFAULT_PARAMS.size,
    n: Math.min(outputImageLimit, Math.max(1, params.n || DEFAULT_PARAMS.n)),
  }
  if (nextParams.size === DEFAULT_PARAMS.size) {
    nextParams.aspectRatio = DEFAULT_PARAMS.aspectRatio
  }

  if (activeProfile.provider === 'openai' && activeProfile.codexCli) {
    nextParams.quality = DEFAULT_PARAMS.quality
  }


  if (nextParams.output_format === 'png') {
    nextParams.output_compression = DEFAULT_PARAMS.output_compression
  }

  return nextParams
}

export function getChangedParams(current: TaskParams, next: TaskParams): Partial<TaskParams> {
  const patch: Partial<TaskParams> = {}
  for (const key of Object.keys(next) as Array<keyof TaskParams>) {
    if (current[key] !== next[key]) {
      ;(patch as Record<keyof TaskParams, TaskParams[keyof TaskParams]>)[key] = next[key]
    }
  }
  return patch
}
