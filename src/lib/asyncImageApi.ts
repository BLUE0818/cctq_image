import type { ApiProfile, AsyncImageResult, AsyncRemoteStatus, TaskParams } from '../types'
import { dataUrlToBlob, imageDataUrlToPngBlob, maskDataUrlToPngBlob } from './canvasImage'
import { assertImageInputPayloadSize, assertMaskEditFileSize, createApiResponseError, pickActualParams, type CallApiOptions } from './imageApiShared'

export const CCTQ_ORIGIN = 'https://www.cctq.ai'
const API_ROOT = `${CCTQ_ORIGIN}/v1/images`

export class SubmissionError extends Error {
  constructor(message: string, public uncertain: boolean, public original?: unknown) { super(message) }
}

export function taskQueryUrl(id: string) {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(id)) throw new Error('无效的远端任务 ID')
  return `${API_ROOT}/tasks/${id}`
}

export function trustedResultUrl(id: string, value: string) {
  const prefix = `${taskQueryUrl(id)}/files/`
  const url = new URL(value, CCTQ_ORIGIN)
  if (url.origin !== CCTQ_ORIGIN || url.username || url.password || url.search || url.hash ||
      !url.href.startsWith(prefix) || !/^\d+$/.test(url.href.slice(prefix.length))) {
    throw new Error('结果地址不是该任务的 CCTQ 下载地址，已拒绝发送 Key')
  }
  return url.href
}

/** Short request deadlines only; queued/generating tasks have no total watchdog. */
async function authenticated<T>(url: string, key: string, init: RequestInit, seconds: number, signal: AbortSignal,
  consume: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const timeout = setTimeout(abort, seconds * 1000)
  try {
    const response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${key}` },
      mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal })
    return await consume(response)
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
  }
}

async function responseJson(response: Response) {
  const raw = await response.text()
  let data: any
  try { data = JSON.parse(raw) } catch {
    if (!response.ok) throw createApiResponseError(response, raw)
    throw new Error(`HTTP ${response.status}：返回内容不是 JSON`)
  }
  if (!response.ok) throw createApiResponseError(response, raw, data)
  return { data, raw }
}

/** Build exactly one n=1 request; no network side effects. Preserve mask/reference semantics. */
export async function prepareAsyncImageRequest(opts: CallApiOptions, profile: ApiProfile): Promise<{ url: string; init: RequestInit }> {
  const { params, inputImageDataUrls, maskDataUrl } = opts
  const prompt = `Use the following text as the complete prompt. Do not rewrite it:\n${opts.prompt}`
  const common: Record<string, unknown> = { model: profile.model, prompt, n: 1, size: params.size,
    output_format: params.output_format, moderation: params.moderation, async: true, stream: false }
  if (params.output_format !== 'png' && params.output_compression != null) common.output_compression = params.output_compression
  if (!inputImageDataUrls.length) {
    if (maskDataUrl) throw new Error('遮罩缺少主图')
    return { url: `${API_ROOT}/generations`, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(common) } }
  }
  const body = new FormData()
  for (const [name, value] of Object.entries(common)) body.append(name, String(value))
  const blobs: Blob[] = []
  for (let i = 0; i < inputImageDataUrls.length; i++) {
    blobs.push(maskDataUrl && i === 0 ? await imageDataUrlToPngBlob(inputImageDataUrls[i]) : await dataUrlToBlob(inputImageDataUrls[i]))
  }
  const mask = maskDataUrl ? await maskDataUrlToPngBlob(maskDataUrl) : null
  if (mask) { assertMaskEditFileSize('遮罩主图文件', blobs[0].size); assertMaskEditFileSize('遮罩文件', mask.size) }
  assertImageInputPayloadSize(blobs.reduce((n, b) => n + b.size, 0) + (mask?.size ?? 0))
  blobs.forEach((blob, i) => body.append('image', blob, `input-${i + 1}.${blob.type.split('/')[1] || 'png'}`))
  if (mask) body.append('mask', mask, 'mask.png')
  return { url: `${API_ROOT}/edits`, init: { method: 'POST', body } }
}

export async function submitAsyncImage(request: Awaited<ReturnType<typeof prepareAsyncImageRequest>>, key: string, signal: AbortSignal) {
  let definitive = false
  try {
    return await authenticated(request.url, key, request.init, 60, signal, async response => {
      // 5xx, timeouts and malformed acceptance can mean the backend already accepted a paid task.
      definitive = response.status >= 400 && response.status < 500 && ![408, 409].includes(response.status)
      const { data } = await responseJson(response)
      if (response.status !== 202 || typeof data.id !== 'string') throw new Error('未返回 202 与任务 ID')
      taskQueryUrl(data.id)
      // Derive the trusted query URL ourselves; never forward credentials to an arbitrary poll_url.
      return { id: data.id as string, status: (data.status === 'in_progress' ? 'in_progress' : 'queued') as AsyncRemoteStatus }
    })
  } catch (error) {
    throw new SubmissionError(definitive ? (error instanceof Error ? error.message : String(error))
      : '提交结果未知，请先到 CCTQ 生图记录确认，避免重复计费。', !definitive, error)
  }
}

export interface AsyncQueryResult {
  status: AsyncRemoteStatus
  results: AsyncImageResult[]
  expiresAt?: number
  error?: string
  errorResponse?: ReturnType<typeof createApiResponseError>['responseSnapshot']
}

export async function queryAsyncImage(id: string, key: string, signal: AbortSignal): Promise<AsyncQueryResult> {
  return authenticated(taskQueryUrl(id), key, {}, 30, signal, async response => {
    const { data, raw } = await responseJson(response)
    if (data.id && data.id !== id) throw new Error('查询结果 ID 与任务不一致')
    if (!['queued', 'in_progress', 'completed', 'failed'].includes(data.status)) throw new Error('未知的任务状态')
    const result: AsyncQueryResult = { status: data.status, results: [], expiresAt: typeof data.expires_at === 'number' ? data.expires_at : undefined }
    if (data.status === 'failed') {
      const error = createApiResponseError(response, raw, data)
      result.error = error.message; result.errorResponse = error.responseSnapshot
    }
    if (data.status === 'completed') {
      if (!Array.isArray(data.result?.data) || !data.result.data.length) throw new Error('任务完成但没有图片地址')
      result.results = data.result.data.map((item: any) => ({
        url: trustedResultUrl(id, item.url),
        actualParams: { ...pickActualParams(data.result), ...pickActualParams(item) },
        revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined,
      }))
    }
    return result
  })
}

export interface DownloadedAsyncImage { dataUrl: string; width: number; height: number; format: TaskParams['output_format'] }
export async function downloadAsyncImage(id: string, url: string, key: string, signal: AbortSignal): Promise<DownloadedAsyncImage> {
  return authenticated(trustedResultUrl(id, url), key, {}, 60, signal, async response => {
    if (!response.ok) { await responseJson(response); throw new Error(`下载失败 HTTP ${response.status}`) }
    const blob = await response.blob()
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || !blob.size) throw new Error('返回内容不是受支持的图片')
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob)
    })
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('图片解码失败')); image.src = dataUrl
    })
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸无效')
    return { dataUrl, width: image.naturalWidth, height: image.naturalHeight, format: blob.type.split('/')[1] as TaskParams['output_format'] }
  })
}

export async function credentialFingerprint(taskId: string, key: string): Promise<string> {
  if (!crypto.subtle) throw new Error('请通过 HTTPS 或 localhost 使用异步生图')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${taskId}\n${key.trim()}`))
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
}
