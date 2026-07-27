import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { DEFAULT_SETTINGS } from './apiProfiles'
import { callImageApi } from './api'

describe('callImageApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('keeps successful Codex results and attaches the failed request response without retrying', async () => {
    let resolveThirdRequest!: (response: Response) => void
    const thirdRequest = new Promise<Response>((resolve) => {
      resolveThirdRequest = resolve
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const callIndex = fetchMock.mock.calls.length
      if (callIndex === 2) {
        return new Response(JSON.stringify({
          error: { message: 'upstream rejected image 2' },
          request_id: 'req-image-2',
        }), {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-image-2' },
        })
      }
      if (callIndex === 3) return thirdRequest
      return new Response(JSON.stringify({
        data: [{ b64_json: `aW1hZ2Ut${callIndex}` }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const resultPromise = callImageApi({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key', codexCli: true },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS, n: 3 },
      inputImageDataUrls: [],
    })
    const onSettled = vi.fn()
    void resultPromise.then(onSettled, onSettled)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    await Promise.resolve()
    expect(onSettled).not.toHaveBeenCalled()

    resolveThirdRequest(new Response(JSON.stringify({
      data: [{ b64_json: 'aW1hZ2Ut3' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const result = await resultPromise

    expect(onSettled).toHaveBeenCalledOnce()
    expect(result.images).toEqual([
      'data:image/png;base64,aW1hZ2Ut1',
      'data:image/png;base64,aW1hZ2Ut3',
    ])
    expect(result.failedRequests).toEqual([{
      requestIndex: 1,
      error: 'upstream rejected image 2',
      response: {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-image-2',
        },
        body: JSON.stringify({
          error: { message: 'upstream rejected image 2' },
          request_id: 'req-image-2',
        }),
      },
    }])
    expect(result.actualParams).toMatchObject({ n: 2 })
  })


  it('does not synthesize actual quality in Codex CLI mode when the API omits it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output_format: 'png',
      size: '1033x1522',
      data: [{ b64_json: 'aW1hZ2U=' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const result = await callImageApi({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key', codexCli: true },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })

    expect(result.actualParams).toEqual({
      output_format: 'png',
      size: '1033x1522',
    })
    expect(result.actualParams?.quality).toBeUndefined()
    expect(result.actualParamsList).toEqual([{
      output_format: 'png',
      size: '1033x1522',
    }])
  })

  it('uses the same-origin API proxy path when API proxy is enabled', async () => {
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'true')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: 'aW1hZ2U=' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await callImageApi({
      settings: {
        ...DEFAULT_SETTINGS,
        apiKey: 'test-key',
        apiProxy: true,
        baseUrl: 'http://api.example.com/v1',
      },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api-proxy/images/generations',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('does not add cache request headers that require extra CORS allow-list entries', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: 'aW1hZ2U=' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await callImageApi({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })

    const [, init] = fetchMock.mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers).not.toHaveProperty('Pragma')
    expect(headers).not.toHaveProperty('Cache-Control')
    expect((init as RequestInit).cache).toBe('no-store')
  })

  it('ignores stored API proxy settings when the current deployment has no proxy', async () => {
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'false')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: 'aW1hZ2U=' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await callImageApi({
      settings: {
        ...DEFAULT_SETTINGS,
        apiKey: 'test-key',
        apiProxy: true,
        baseUrl: 'http://api.example.com/v1',
      },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.cctq.ai/v1/images/generations',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('attaches the complete upstream response snapshot to API errors', async () => {
    const rawBody = JSON.stringify({
      error: { message: 'upstream rejected request' },
      request_id: 'req-123',
      detail: 'x'.repeat(120 * 1024),
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'upstream rejected request' },
      request_id: 'req-123',
      detail: 'x'.repeat(120 * 1024),
    }), {
      status: 400,
      statusText: 'Bad Request',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': 'req-123',
        Authorization: 'Bearer should-not-be-stored',
      },
    }))

    await expect(callImageApi({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })).rejects.toMatchObject({
      message: 'upstream rejected request',
      responseSnapshot: {
        status: 400,
        statusText: 'Bad Request',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-123',
        },
        body: rawBody,
      },
    })
  })

  it('fails immediately when a successful HTTP response contains an upstream error payload', async () => {
    const rawBody = JSON.stringify({
      error: { message: 'content policy rejected the request' },
      request_id: 'req-policy',
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(rawBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-policy' },
    }))

    await expect(callImageApi({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })).rejects.toMatchObject({
      message: 'content policy rejected the request',
      responseSnapshot: {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-policy',
        },
        body: rawBody,
      },
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it.each([
    ['detail', { detail: 'quota exceeded', request_id: 'req-detail' }, 'quota exceeded'],
    ['message', { message: 'request rejected', request_id: 'req-message' }, 'request rejected'],
  ])('preserves a 200 upstream %s response when no image is returned', async (_, payload, expectedMessage) => {
    const rawBody = JSON.stringify(payload)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(rawBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(callImageApi({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })).rejects.toMatchObject({
      message: expectedMessage,
      responseSnapshot: {
        status: 200,
        body: rawBody,
      },
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('accepts a successful response that includes a top-level message and an image', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      message: 'success',
      data: [{ b64_json: 'aW1hZ2U=' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const result = await callImageApi({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })

    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('requests non-streaming b64 image generations', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: 'aW1hZ2U=' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await callImageApi({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      response_format: 'b64_json',
    })
    expect(JSON.parse(String((init as RequestInit).body))).not.toHaveProperty('stream')
    expect(JSON.parse(String((init as RequestInit).body))).not.toHaveProperty('partial_images')
  })

  it('preserves the actual image mime when upstream returns non-png base64', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: 'UklGRiQAAABXRUJQVlA4IAAAAAA=' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const result = await callImageApi({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS, output_format: 'png' },
      inputImageDataUrls: [],
    })

    expect(result.images[0]).toBe('data:image/webp;base64,UklGRiQAAABXRUJQVlA4IAAAAAA=')
  })

  it('includes the returned image URL when browser download fails', async () => {
    const imageUrl = 'https://cdn.example.com/generated.webp'
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith('/images/generations')) {
        return Promise.resolve(new Response(JSON.stringify({
          data: [{ url: imageUrl }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      }
      return Promise.reject(new TypeError('Failed to fetch'))
    })

    await expect(callImageApi({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })).rejects.toThrow(`图片已生成，但浏览器无法下载返回的图片 URL：${imageUrl}`)
  })

  it('requests non-streaming b64 image edits with repeated image fields', async () => {
    const nativeFetch = globalThis.fetch.bind(globalThis)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' && input.startsWith('data:')) return nativeFetch(input, init)
      return Promise.resolve(new Response(JSON.stringify({
        data: [{ b64_json: 'aW1hZ2U=' }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    })

    await callImageApi({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: ['data:image/png;base64,aW1hZ2U='],
    })

    const [, init] = fetchMock.mock.calls.find(([input]) => typeof input === 'string' && input.endsWith('/images/edits')) ?? []
    const body = (init as RequestInit).body as FormData
    expect(body.get('response_format')).toBe('b64_json')
    expect(body.get('stream')).toBeNull()
    expect(body.get('partial_images')).toBeNull()
    expect(body.getAll('image')).toHaveLength(1)
    expect(body.getAll('image[]')).toHaveLength(0)
  })

})
