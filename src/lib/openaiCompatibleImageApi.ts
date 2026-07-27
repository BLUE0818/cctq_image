import type { ApiProfile, ImageApiResponse } from '../types'
import { dataUrlToBlob, imageDataUrlToPngBlob, maskDataUrlToPngBlob } from './canvasImage'
import { buildApiUrl, isApiProxyAvailable, readClientDevProxyConfig } from './devProxy'
import {
  assertImageInputPayloadSize,
  assertMaskEditFileSize,
  type CallApiOptions,
  type CallApiResult,
  createApiResponseError,
  fetchImageUrlAsDataUrl,
  getApiErrorResponseSnapshot,
  getDataUrlDecodedByteSize,
  hasApiErrorMessagePayload,
  isDataUrl,
  isHttpUrl,
  isApiErrorPayload,
  mergeActualParams,
  MIME_MAP,
  normalizeBase64Image,
  pickActualParams,
  readApiErrorResponse,
} from './imageApiShared'

const PROMPT_REWRITE_GUARD_PREFIX = 'Use the following text as the complete prompt. Do not rewrite it:'
const IMAGE_RESPONSE_FORMAT = 'b64_json'

function normalizeImageApiPayload(value: unknown): ImageApiResponse {
  if (Array.isArray(value)) return { data: value as ImageApiResponse['data'] }
  if (value && typeof value === 'object') return value as ImageApiResponse
  return { data: [] }
}

function createRequestHeaders(profile: ApiProfile): Record<string, string> {
  return {
    Authorization: `Bearer ${profile.apiKey}`,
  }
}
function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function parseImagesApiResponse(payload: ImageApiResponse, mime: string, signal?: AbortSignal): Promise<CallApiResult> {
  const data = payload.data
  if (!Array.isArray(data) || !data.length) {
    throw new Error('接口未返回图片数据')
  }

  const images: string[] = []
  const revisedPrompts: Array<string | undefined> = []
  for (const item of data) {
    const b64 = item.b64_json
    if (b64) {
      images.push(normalizeBase64Image(b64, mime))
      revisedPrompts.push(typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined)
      continue
    }

    if (isHttpUrl(item.url) || isDataUrl(item.url)) {
      images.push(await fetchImageUrlAsDataUrl(item.url, mime, signal))
      revisedPrompts.push(typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined)
    }
  }

  if (!images.length) {
    throw new Error('接口未返回可用图片数据')
  }

  const actualParams = mergeActualParams(
    pickActualParams(payload),
  )
  return {
    images,
    actualParams,
    actualParamsList: images.map(() => actualParams),
    revisedPrompts,
  }
}

interface ParsedJsonResponse {
  payload: unknown
  rawBody: string
}

async function parseResponseJson(response: Response, rejectErrorPayload = false): Promise<ParsedJsonResponse> {
  const text = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(text ? `接口返回了非 JSON 响应：${text}` : '接口返回了空响应')
  }
  if (rejectErrorPayload && isApiErrorPayload(payload)) {
    throw createApiResponseError(response, text, payload)
  }
  return { payload, rawBody: text }
}

function hasImagesApiResult(payload: ImageApiResponse): boolean {
  return Array.isArray(payload.data) && payload.data.some((item) =>
    Boolean(item?.b64_json) || isHttpUrl(item?.url) || isDataUrl(item?.url),
  )
}

export async function callOpenAICompatibleImageApi(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
  return callImagesApi(opts, profile)
}

async function callImagesApi(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
  const n = opts.params.n > 0 ? opts.params.n : 1
  if (profile.codexCli && n > 1) {
    return callImagesApiConcurrent(opts, profile, n)
  }

  return callImagesApiSingle(opts, profile)
}

async function callImagesApiConcurrent(opts: CallApiOptions, profile: ApiProfile, n: number): Promise<CallApiResult> {
  const singleOpts = { ...opts, params: { ...opts.params, n: 1, quality: 'auto' as const } }
  const results = await Promise.allSettled(
    Array.from({ length: n }).map(() => callImagesApiSingle(singleOpts, profile)),
  )

  const successfulResults = results
    .filter((r): r is PromiseFulfilledResult<CallApiResult> => r.status === 'fulfilled')
    .map((r) => r.value)
  const failedRequests = results.flatMap((r, requestIndex) => {
    if (r.status !== 'rejected') return []
    const response = getApiErrorResponseSnapshot(r.reason)
    return [{
      requestIndex,
      error: getErrorMessage(r.reason),
      ...(response ? { response } : {}),
    }]
  })

  if (successfulResults.length === 0) {
    const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (firstError) throw firstError.reason
    throw new Error('所有并发请求均失败')
  }

  const images = successfulResults.flatMap((r) => r.images)
  const actualParamsList = successfulResults.flatMap((r) =>
    r.actualParamsList?.length ? r.actualParamsList : r.images.map(() => r.actualParams),
  )
  const revisedPrompts = successfulResults.flatMap((r) =>
    r.revisedPrompts?.length ? r.revisedPrompts : r.images.map(() => undefined),
  )
  const actualParams = mergeActualParams(
    successfulResults[0]?.actualParams ?? {},
    { n: images.length },
  )

  return {
    images,
    actualParams,
    actualParamsList,
    revisedPrompts,
    ...(failedRequests.length ? { failedRequests } : {}),
  }
}

async function callImagesApiSingle(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
  const { prompt: originalPrompt, params, inputImageDataUrls } = opts
  const prompt = profile.codexCli
    ? `${PROMPT_REWRITE_GUARD_PREFIX}\n${originalPrompt}`
    : originalPrompt
  const isEdit = inputImageDataUrls.length > 0
  const mime = MIME_MAP[params.output_format] || 'image/png'
  const proxyConfig = readClientDevProxyConfig()
  const useApiProxy = profile.apiProxy && isApiProxyAvailable(proxyConfig)
  const requestHeaders = createRequestHeaders(profile)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), profile.timeout * 1000)

  try {
    let response: Response

    if (isEdit) {
      const formData = new FormData()
      formData.append('model', profile.model)
      formData.append('prompt', prompt)
      formData.append('size', params.size)
      formData.append('output_format', params.output_format)
      formData.append('moderation', params.moderation)
      formData.append('response_format', IMAGE_RESPONSE_FORMAT)

      if (!profile.codexCli) {
        formData.append('quality', params.quality)
      }

      if (params.output_format !== 'png' && params.output_compression != null) {
        formData.append('output_compression', String(params.output_compression))
      }
      if (params.n > 1) {
        formData.append('n', String(params.n))
      }

      const imageBlobs: Blob[] = []
      for (let i = 0; i < inputImageDataUrls.length; i++) {
        const dataUrl = inputImageDataUrls[i]
        const blob = opts.maskDataUrl && i === 0
          ? await imageDataUrlToPngBlob(dataUrl)
          : await dataUrlToBlob(dataUrl)
        imageBlobs.push(blob)
      }

      const maskBlob = opts.maskDataUrl ? await maskDataUrlToPngBlob(opts.maskDataUrl) : null
      if (opts.maskDataUrl) {
        assertMaskEditFileSize('遮罩主图文件', imageBlobs[0]?.size ?? 0)
        assertMaskEditFileSize('遮罩文件', maskBlob?.size ?? 0)
      }
      assertImageInputPayloadSize(
        imageBlobs.reduce((sum, blob) => sum + blob.size, 0) + (maskBlob?.size ?? 0),
      )

      for (let i = 0; i < imageBlobs.length; i++) {
        const blob = imageBlobs[i]
        const ext = blob.type.split('/')[1] || 'png'
        formData.append('image', blob, `input-${i + 1}.${ext}`)
      }

      if (maskBlob) {
        formData.append('mask', maskBlob, 'mask.png')
      }

      response = await fetch(buildApiUrl(profile.baseUrl, 'images/edits', proxyConfig, useApiProxy), {
        method: 'POST',
        headers: requestHeaders,
        cache: 'no-store',
        body: formData,
        signal: controller.signal,
      })
    } else {
      const body: Record<string, unknown> = {
        model: profile.model,
        prompt,
        size: params.size,
        output_format: params.output_format,
        moderation: params.moderation,
        response_format: IMAGE_RESPONSE_FORMAT,
      }

      if (!profile.codexCli) {
        body.quality = params.quality
      }

      if (params.output_format !== 'png' && params.output_compression != null) {
        body.output_compression = params.output_compression
      }
      if (params.n > 1) {
        body.n = params.n
      }

      response = await fetch(buildApiUrl(profile.baseUrl, 'images/generations', proxyConfig, useApiProxy), {
        method: 'POST',
        headers: {
          ...requestHeaders,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    }

    if (!response.ok) {
      throw await readApiErrorResponse(response)
    }

    const parsedResponse = await parseResponseJson(response, true)
    const payload = normalizeImageApiPayload(parsedResponse.payload)
    if (!hasImagesApiResult(payload) && hasApiErrorMessagePayload(payload)) {
      throw createApiResponseError(response, parsedResponse.rawBody, payload)
    }
    return parseImagesApiResponse(payload, mime, controller.signal)
  } finally {
    clearTimeout(timeoutId)
  }
}
