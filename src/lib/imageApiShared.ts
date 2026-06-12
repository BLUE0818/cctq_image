import type { ApiErrorResponseSnapshot, AppSettings, TaskParams } from '../types'

export const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export const MAX_MASK_EDIT_FILE_BYTES = 50 * 1024 * 1024
export const MAX_IMAGE_INPUT_PAYLOAD_BYTES = 512 * 1024 * 1024
const MAX_ERROR_RESPONSE_BODY_CHARS = 100 * 1024
const ERROR_RESPONSE_HEADER_ALLOWLIST = new Set([
  'content-type',
  'date',
  'request-id',
  'x-request-id',
  'openai-request-id',
  'cf-ray',
])

export class ApiResponseError extends Error {
  responseSnapshot: ApiErrorResponseSnapshot

  constructor(message: string, responseSnapshot: ApiErrorResponseSnapshot) {
    super(message)
    this.name = 'ApiResponseError'
    this.responseSnapshot = responseSnapshot
  }
}

export interface CallApiOptions {
  settings: AppSettings
  prompt: string
  params: TaskParams
  /** 输入图片的 data URL 列表 */
  inputImageDataUrls: string[]
  maskDataUrl?: string
  onFalRequestEnqueued?: (request: { requestId: string; endpoint: string }) => void
  onCustomTaskEnqueued?: (task: { taskId: string }) => void
}

export interface CallApiResult {
  /** base64 data URL 列表 */
  images: string[]
  /** API 返回的实际生效参数 */
  actualParams?: Partial<TaskParams>
  /** 每张图片对应的实际生效参数 */
  actualParamsList?: Array<Partial<TaskParams> | undefined>
  /** 每张图片对应的 API 改写提示词 */
  revisedPrompts?: Array<string | undefined>
  /** 并发多图请求中失败的单张请求 */
  failedRequests?: Array<{ requestIndex: number; error: string }>
}

export function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

export function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:')
}

function normalizeBase64Payload(value: string): string {
  const payload = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
  return payload.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/')
}

function decodeBase64Prefix(value: string, maxBytes = 16): Uint8Array {
  const normalized = normalizeBase64Payload(value)
  const sample = normalized.slice(0, Math.ceil(maxBytes / 3) * 4)
  try {
    const binary = atob(sample)
    const bytes = new Uint8Array(Math.min(binary.length, maxBytes))
    for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return new Uint8Array()
  }
}

function detectImageMimeFromBase64(value: string): string | undefined {
  const bytes = decodeBase64Prefix(value, 16)
  if (bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) return 'image/webp'
  if (bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) return 'image/gif'
  return undefined
}

export function normalizeBase64Image(value: string, fallbackMime: string): string {
  if (value.startsWith('data:')) return value
  const mime = detectImageMimeFromBase64(value) ?? fallbackMime
  return `data:${mime};base64,${value}`
}

function formatMiB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

export function getDataUrlEncodedByteSize(dataUrl: string): number {
  return dataUrl.length
}

export function getDataUrlDecodedByteSize(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return dataUrl.length

  const meta = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  if (!/;base64/i.test(meta)) return decodeURIComponent(payload).length

  const normalized = payload.replace(/\s/g, '')
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding)
}

function assertMaxBytes(label: string, bytes: number, maxBytes: number) {
  if (bytes > maxBytes) {
    throw new Error(`${label}过大：${formatMiB(bytes)}，上限为 ${formatMiB(maxBytes)}`)
  }
}

export function assertImageInputPayloadSize(bytes: number) {
  assertMaxBytes('图像输入有效负载总大小', bytes, MAX_IMAGE_INPUT_PAYLOAD_BYTES)
}

export function assertMaskEditFileSize(label: string, bytes: number) {
  assertMaxBytes(label, bytes, MAX_MASK_EDIT_FILE_BYTES)
}

async function blobToDataUrl(blob: Blob, fallbackMime: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''

  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000)
    binary += String.fromCharCode(...chunk)
  }

  return `data:${blob.type || fallbackMime};base64,${btoa(binary)}`
}

export async function fetchImageUrlAsDataUrl(url: string, fallbackMime: string, signal?: AbortSignal): Promise<string> {
  if (isDataUrl(url)) return url

  let response: Response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      signal,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`图片已生成，但浏览器无法下载返回的图片 URL：${url}\n原因：${message}`)
  }

  if (!response.ok) throw new Error(`图片 URL 下载失败：HTTP ${response.status}\nURL：${url}`)

  const blob = await response.blob()
  return blobToDataUrl(blob, fallbackMime)
}

function pickSafeResponseHeaders(headers: Headers): Record<string, string> | undefined {
  const picked: Record<string, string> = {}
  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase()
    if (ERROR_RESPONSE_HEADER_ALLOWLIST.has(normalizedKey)) picked[normalizedKey] = value
  })
  return Object.keys(picked).length ? picked : undefined
}

function truncateErrorBody(body: string): { body: string; truncated?: boolean } {
  if (body.length <= MAX_ERROR_RESPONSE_BODY_CHARS) return { body }
  return {
    body: body.slice(0, MAX_ERROR_RESPONSE_BODY_CHARS),
    truncated: true,
  }
}

function extractApiErrorMessage(parsed: unknown, fallback: string): string {
  if (!parsed || typeof parsed !== 'object') return fallback
  const record = parsed as Record<string, unknown>
  const error = record.error
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
    return (error as Record<string, string>).message
  }
  if (typeof record.detail === 'string') return record.detail
  if (Array.isArray(record.detail)) {
    return record.detail.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')
  }
  if (typeof record.error === 'string') return record.error
  if (typeof record.message === 'string') return record.message
  return fallback
}

export async function readApiErrorResponse(response: Response): Promise<ApiResponseError> {
  let errorMsg = `HTTP ${response.status}`
  let rawBody = ''
  try {
    rawBody = await response.text()
    if (rawBody) {
      try {
        errorMsg = extractApiErrorMessage(JSON.parse(rawBody), errorMsg)
      } catch {
        errorMsg = rawBody
      }
    }
  } catch {
    /* keep default status message */
  }
  const truncated = truncateErrorBody(rawBody)
  return new ApiResponseError(errorMsg, {
    status: response.status,
    statusText: response.statusText,
    url: response.url || undefined,
    headers: pickSafeResponseHeaders(response.headers),
    body: truncated.body,
    truncated: truncated.truncated,
  })
}

export function getApiErrorResponseSnapshot(err: unknown): ApiErrorResponseSnapshot | undefined {
  return err instanceof ApiResponseError ? err.responseSnapshot : undefined
}

export function pickActualParams(source: unknown): Partial<TaskParams> {
  if (!source || typeof source !== 'object') return {}
  const record = source as Record<string, unknown>
  const actualParams: Partial<TaskParams> = {}

  if (typeof record.size === 'string') actualParams.size = record.size
  if (record.quality === 'auto' || record.quality === 'low' || record.quality === 'medium' || record.quality === 'high') {
    actualParams.quality = record.quality
  }
  if (record.output_format === 'png' || record.output_format === 'jpeg' || record.output_format === 'webp') {
    actualParams.output_format = record.output_format
  }
  if (typeof record.output_compression === 'number') actualParams.output_compression = record.output_compression
  if (record.moderation === 'auto' || record.moderation === 'low') actualParams.moderation = record.moderation
  if (typeof record.n === 'number') actualParams.n = record.n

  return actualParams
}

export function mergeActualParams(...sources: Array<Partial<TaskParams> | undefined>): Partial<TaskParams> | undefined {
  const merged = Object.assign({}, ...sources.filter((source) => source && Object.keys(source).length))
  return Object.keys(merged).length ? merged : undefined
}
