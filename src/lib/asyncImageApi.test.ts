import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { DEFAULT_SETTINGS, createDefaultOpenAIProfile } from './apiProfiles'
import { credentialFingerprint, prepareAsyncImageRequest, queryAsyncImage, SubmissionError, submitAsyncImage, taskQueryUrl, trustedResultUrl } from './asyncImageApi'

const profile = createDefaultOpenAIProfile({ apiKey: 'synthetic-key' })
const opts = { settings: DEFAULT_SETTINGS, prompt: 'cat', params: { ...DEFAULT_PARAMS, n: 4 }, inputImageDataUrls: [] as string[] }
const signal = () => new AbortController().signal
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => vi.unstubAllGlobals())

describe('CCTQ async protocol', () => {
  it('prepares one async request, preserves size and guard, without synchronous response_format or quality', async () => {
    const request = await prepareAsyncImageRequest(opts, profile)
    expect(JSON.parse(String(request.init.body))).toMatchObject({ model: 'gpt-image-2', n: 1, async: true, stream: false, size: 'auto' })
    expect(request.init.body).not.toContain('response_format')
    expect(request.init.body).not.toContain('quality')
    expect(request.init.body).toContain('Do not rewrite it')
  })
  it('uses repeated image fields for edits and multipart async=true', async () => {
    const request = await prepareAsyncImageRequest({ ...opts, inputImageDataUrls: ['data:image/png;base64,YQ==', 'data:image/png;base64,Yg=='] }, profile)
    const form = request.init.body as FormData
    expect(request.url).toContain('/images/edits')
    expect(form.get('async')).toBe('true')
    expect(form.get('n')).toBe('1')
    expect(form.getAll('image')).toHaveLength(2)
    expect(form.has('image[]')).toBe(false)
  })
  it('reads 202 ID and never follows an untrusted poll_url', async () => {
    const fetcher = vi.fn(async (..._args: unknown[]) => json({ id: 'task-1', status: 'queued', poll_url: 'https://evil.test/steal' }, 202))
    vi.stubGlobal('fetch', fetcher)
    const reply = await submitAsyncImage(await prepareAsyncImageRequest(opts, profile), profile.apiKey, signal())
    expect(reply).toEqual({ id: 'task-1', status: 'queued' })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', credentials: 'omit', mode: 'cors' })
  })
  it.each([401, 403, 429])('classifies explicit HTTP %s rejection and keeps error body', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { message: 'rejected' } }, status)))
    await expect(submitAsyncImage(await prepareAsyncImageRequest(opts, profile), profile.apiKey, signal())).rejects.toMatchObject({ uncertain: false, original: { responseSnapshot: { status } } })
  })
  it.each([500, 504, 408])('treats HTTP %s as uncertain, never submits twice', async status => {
    const f = vi.fn(async () => json({ error: { message: 'timeout' } }, status)); vi.stubGlobal('fetch', f)
    await expect(submitAsyncImage(await prepareAsyncImageRequest(opts, profile), profile.apiKey, signal())).rejects.toMatchObject({ uncertain: true })
    expect(f).toHaveBeenCalledOnce()
  })
  it('does not retry a network error or malformed accepted response', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(json({ status: 'queued' }, 202)); vi.stubGlobal('fetch', f)
    const request = await prepareAsyncImageRequest(opts, profile)
    await expect(submitAsyncImage(request, 'key', signal())).rejects.toBeInstanceOf(SubmissionError)
    expect(f).toHaveBeenCalledTimes(1)
    await expect(submitAsyncImage(request, 'key', signal())).rejects.toMatchObject({ uncertain: true })
  })
  it.each(['https://evil.test/v1/images/tasks/a/files/0', 'https://www.cctq.ai/v1/images/tasks/b/files/0', '/v1/images/tasks/a/files/0?api_key=bad', 'https://u:p@www.cctq.ai/v1/images/tasks/a/files/0', '/v1/images/tasks/a/files/../0'])('rejects untrusted download URL %s', url => {
    expect(() => trustedResultUrl('a', url)).toThrow()
  })
  it('accepts only the expected CCTQ task/file path', () => {
    expect(trustedResultUrl('abc', '/v1/images/tasks/abc/files/0')).toBe('https://www.cctq.ai/v1/images/tasks/abc/files/0')
    expect(() => taskQueryUrl('../other')).toThrow()
  })
  it('reads final URLs and expiry without downloading during query', async () => {
    const f = vi.fn(async () => json({ id: 'a', status: 'completed', expires_at: 999,
      result: { data: [{ url: '/v1/images/tasks/a/files/0', revised_prompt: 'cat' }] } })); vi.stubGlobal('fetch', f)
    const result = await queryAsyncImage('a', 'key', signal())
    expect(result).toMatchObject({ status: 'completed', expiresAt: 999, results: [{ url: 'https://www.cctq.ai/v1/images/tasks/a/files/0', revisedPrompt: 'cat' }] })
    expect(f).toHaveBeenCalledOnce()
  })
  it('retains server failure snapshot and message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ status: 'failed', error: { message: 'bad prompt' } })))
    expect(await queryAsyncImage('a', 'key', signal())).toMatchObject({ status: 'failed', error: 'bad prompt', errorResponse: { body: expect.stringContaining('bad prompt') } })
  })
  it('rejects unsupported state or mismatched task id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ status: 'mystery' })).mockResolvedValueOnce(json({ id: 'other', status: 'queued' })))
    await expect(queryAsyncImage('a', 'key', signal())).rejects.toThrow('未知')
    await expect(queryAsyncImage('a', 'key', signal())).rejects.toThrow('不一致')
  })
  it('binds credential fingerprint to both task and key', async () => {
    expect(await credentialFingerprint('a', 'key')).not.toBe(await credentialFingerprint('a', 'other'))
    expect(await credentialFingerprint('a', 'key')).not.toBe(await credentialFingerprint('b', 'key'))
    expect(await credentialFingerprint('a', 'key')).not.toContain('key')
  })
})
