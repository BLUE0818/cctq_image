import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AsyncImageRuntime, type AsyncRuntimeDeps } from './asyncImageRuntime'
import { credentialFingerprint, downloadAsyncImage, prepareAsyncImageRequest, queryAsyncImage, SubmissionError, submitAsyncImage } from './asyncImageApi'
import { pauseAsyncTask, summarizeAsyncTask } from './asyncTaskState'
import { DEFAULT_PARAMS, type StoredImage, type TaskRecord } from '../types'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS } from './apiProfiles'

vi.mock('./asyncImageApi', async importOriginal => ({
  ...await importOriginal<typeof import('./asyncImageApi')>(),
  prepareAsyncImageRequest: vi.fn(async () => ({ url: 'https://www.cctq.ai/v1/images/generations', init: { method: 'POST' } })),
  submitAsyncImage: vi.fn(), queryAsyncImage: vi.fn(), downloadAsyncImage: vi.fn(),
  credentialFingerprint: vi.fn(),
}))
const profile = createDefaultOpenAIProfile({ id: 'original', apiKey: 'synthetic-key' })
const initial = { profile, opts: { settings: DEFAULT_SETTINGS, prompt: 'cat', params: DEFAULT_PARAMS, inputImageDataUrls: [] } }
const completed = (id = 'r0') => ({ status: 'completed' as const, results: [{ url: `https://www.cctq.ai/v1/images/tasks/${id}/files/0` }], expiresAt: 9999999999 })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

async function fixture(n = 1) {
  let disk: TaskRecord | undefined = { id: 'local', prompt: 'cat', params: { ...DEFAULT_PARAMS, n }, apiProfileId: profile.id,
    inputImageIds: [], outputImages: [], status: 'running', error: null, createdAt: 1, finishedAt: null, elapsed: null,
    asyncGeneration: { protocol: 'cctq-images-v1', credentialFingerprint: await credentialFingerprint('local', profile.apiKey),
      slots: Array.from({ length: n }, (_, index) => ({ index, phase: 'pending', results: [] })) } }
  let view = disk
  const images: StoredImage[] = []
  const deps: AsyncRuntimeDeps = {
    read: vi.fn(async () => disk ? structuredClone(disk) : undefined),
    commit: vi.fn(async (_id, change, image) => {
      if (!disk) return undefined
      disk = structuredClone(change(disk)); if (image) images.push(image)
      return disk
    }),
    profile: vi.fn(() => profile), changed: vi.fn(t => { view = t }), saved: vi.fn(), imageId: vi.fn(async d => 'hash-'+d),
    lock: vi.fn(async (_id, action) => action()), notify: vi.fn(),
  }
  const runtime = new AsyncImageRuntime(deps)
  return { runtime, deps, images, disk: () => disk!, view: () => view!, remove: () => { disk = undefined },
    set: (task: TaskRecord) => { disk = structuredClone(task); view = disk } }
}
async function flush() { for (let i = 0; i < 50; i++) await Promise.resolve() }
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers()
  vi.mocked(credentialFingerprint).mockImplementation(async (id, key) => `fingerprint:${id}:${key}`)
  vi.mocked(prepareAsyncImageRequest).mockResolvedValue({ url: 'https://www.cctq.ai/v1/images/generations', init: { method: 'POST' } })
  vi.mocked(submitAsyncImage).mockImplementation(async () => ({ id: 'r0', status: 'queued' }))
  vi.mocked(queryAsyncImage).mockImplementation(async () => completed())
  vi.mocked(downloadAsyncImage).mockImplementation(async () => ({ dataUrl: 'pixels', width: 1254, height: 1254, format: 'png' }))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('durable async generation lifecycle', () => {
  it('persists acknowledged id before waiting 5s, atomically saves image/reference, no total timeout', async () => {
    const f = await fixture(); const op = f.runtime.run('local', initial); await flush()
    expect(f.disk().asyncGeneration!.slots[0].remoteId).toBe('r0')
    expect(queryAsyncImage).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4999); expect(queryAsyncImage).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1); await op
    expect(f.disk()).toMatchObject({ status: 'done', outputImages: ['hash-pixels'], actualParamsByImage: { 'hash-pixels': { size: '1254x1254' } } })
    const calls = vi.mocked(f.deps.commit).mock.calls.filter(c => c[2])
    expect(calls).toHaveLength(1); expect(f.images).toHaveLength(1)
    expect(submitAsyncImage).toHaveBeenCalledOnce()
  })
  it('does not overlap queries and keeps queued/in_progress waiting beyond ten minutes', async () => {
    const f = await fixture(); const slow = deferred<Awaited<ReturnType<typeof queryAsyncImage>>>()
    vi.mocked(queryAsyncImage).mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ status: 'in_progress', results: [] }).mockResolvedValueOnce(completed())
    const op = f.runtime.run('local', initial); await flush(); await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(650000); expect(queryAsyncImage).toHaveBeenCalledTimes(1); expect(f.disk().status).toBe('running')
    slow.resolve({ status: 'queued', results: [] }); await flush(); await vi.advanceTimersByTimeAsync(10000); await op
    expect(f.disk().status).toBe('done'); expect(submitAsyncImage).toHaveBeenCalledOnce()
  })
  it('shares repeated run clicks rather than submitting twice', async () => {
    const f = await fixture(); const a = f.runtime.run('local', initial); const b = f.runtime.run('local', initial)
    expect(a).toBe(b); await flush(); await vi.advanceTimersByTimeAsync(5000); await a; expect(submitAsyncImage).toHaveBeenCalledOnce()
  })
  it('pauses query network failure, then resumes with GET not POST', async () => {
    const f = await fixture(); vi.mocked(queryAsyncImage).mockRejectedValueOnce(new Error('offline'))
    const op = f.runtime.run('local', initial); await flush(); await vi.advanceTimersByTimeAsync(5000); await op
    expect(f.disk().status).toBe('paused'); expect(f.disk().asyncGeneration!.slots[0].error).toBe('offline')
    await f.runtime.run('local'); expect(f.disk().status).toBe('done'); expect(submitAsyncImage).toHaveBeenCalledOnce()
  })
  it('retains results after download failure and resumes only missing downloads', async () => {
    const f = await fixture(); vi.mocked(downloadAsyncImage).mockRejectedValueOnce(new Error('download offline'))
    const op = f.runtime.run('local', initial); await flush(); await vi.advanceTimersByTimeAsync(5000); await op
    expect(f.disk().asyncGeneration!.slots[0]).toMatchObject({ phase: 'paused', remoteStatus: 'completed', results: [{ url: expect.stringContaining('/files/0') }] })
    await f.runtime.run('local'); expect(f.disk().status).toBe('done'); expect(queryAsyncImage).toHaveBeenCalledTimes(1)
    await f.runtime.run('local'); expect(downloadAsyncImage).toHaveBeenCalledTimes(2)
  })
  it('keeps unknown submit separate and never resubmits on resume', async () => {
    const f = await fixture(); vi.mocked(submitAsyncImage).mockRejectedValueOnce(new SubmissionError('unknown', true))
    await f.runtime.run('local', initial); expect(f.disk()).toMatchObject({ status: 'paused', asyncGeneration: { slots: [{ phase: 'unknown' }] } })
    await f.runtime.run('local'); expect(submitAsyncImage).toHaveBeenCalledOnce(); expect(queryAsyncImage).not.toHaveBeenCalled()
  })
  it('shows explicit rejected submissions as failed without retry', async () => {
    const f = await fixture(); vi.mocked(submitAsyncImage).mockRejectedValueOnce(new SubmissionError('rejected', false))
    await f.runtime.run('local', initial); expect(f.disk().status).toBe('error'); expect(f.disk().asyncGeneration!.slots[0].phase).toBe('failed')
    await f.runtime.run('local'); expect(submitAsyncImage).toHaveBeenCalledOnce()
  })
  it('keeps concurrent partial success while one fails and another waits', async () => {
    const f = await fixture(3); let i = 0
    vi.mocked(submitAsyncImage).mockImplementation(async () => ({ id: 'r'+i++, status: 'queued' }))
    const slow = deferred<Awaited<ReturnType<typeof queryAsyncImage>>>()
    vi.mocked(queryAsyncImage).mockImplementation(async id => id === 'r0' ? { status: 'failed', error: 'upstream failed', results: [] } : id === 'r1' ? completed(id) : slow.promise)
    const op = f.runtime.run('local', initial); await flush(); await vi.advanceTimersByTimeAsync(5000); await flush()
    expect(f.disk().outputImages).toHaveLength(1); expect(f.disk().status).toBe('running'); expect(submitAsyncImage).toHaveBeenCalledTimes(3)
    slow.resolve(completed('r2')); await op
    expect(f.disk().status).toBe('done'); expect(f.disk().outputErrors).toMatchObject([{ requestIndex: 0, error: 'upstream failed' }])
    expect(f.disk().asyncGeneration!.slots.map(s => s.phase)).toEqual(['failed', 'saved', 'saved'])
  })
  it('keeps ID in memory when ID persistence fails and polls only after repair', async () => {
    const f = await fixture(); const original = f.deps.commit
    f.deps.commit = vi.fn(async (id, change, image) => {
      const next = change(f.disk()); if (next.asyncGeneration!.slots[0].remoteId) throw new Error('disk full')
      return original(id, change, image)
    })
    await f.runtime.run('local', initial); expect(f.runtime.hasRescue('local')).toBe(true)
    expect(f.view().asyncGeneration!.slots[0]).toMatchObject({ remoteId: 'r0', phase: 'paused' })
    expect(queryAsyncImage).not.toHaveBeenCalled()
    f.deps.commit = original
    await f.runtime.run('local'); expect(f.disk().status).toBe('done'); expect(submitAsyncImage).toHaveBeenCalledOnce()
  })
  it('does not mark a failed image transaction as saved and can recover it', async () => {
    const f = await fixture(); const original = f.deps.commit
    f.deps.commit = vi.fn(async (id, change, image) => { if (image) throw new Error('quota'); return original(id, change, image) })
    const op = f.runtime.run('local', initial); await flush(); await vi.advanceTimersByTimeAsync(5000); await op
    expect(f.images).toHaveLength(0); expect(f.view().outputImages).toHaveLength(0)
    expect(f.view().asyncGeneration!.slots[0].results[0].imageId).toBeUndefined()
    f.deps.commit = original; await f.runtime.run('local'); expect(f.disk().status).toBe('done')
  })
  it('refresh marks work paused without losing IDs, and the next instance resumes only explicitly', async () => {
    const f = await fixture(2)
    const t = f.disk(); t.asyncGeneration!.slots[0] = { index: 0, phase: 'polling', remoteId: 'r0', remoteStatus: 'in_progress', results: [] }
    t.asyncGeneration!.slots[1].phase = 'submitting'; f.set(pauseAsyncTask(t))
    expect(f.disk().asyncGeneration!.slots.map(s => s.phase)).toEqual(['paused', 'unknown'])
    const next = new AsyncImageRuntime(f.deps); expect(queryAsyncImage).not.toHaveBeenCalled()
    await next.run('local'); expect(queryAsyncImage).toHaveBeenCalledOnce(); expect(submitAsyncImage).not.toHaveBeenCalled()
    expect(f.disk().outputImages).toHaveLength(1); expect(f.disk().status).toBe('paused')
  })
  it('never recreates a deleted task after late query completion', async () => {
    const f = await fixture(); const slow = deferred<Awaited<ReturnType<typeof queryAsyncImage>>>()
    vi.mocked(queryAsyncImage).mockReturnValueOnce(slow.promise)
    const op = f.runtime.run('local', initial); await flush(); await vi.advanceTimersByTimeAsync(5000)
    f.runtime.cancel('local'); f.remove(); slow.resolve(completed()); await op
    expect(f.disk()).toBeUndefined(); expect(downloadAsyncImage).not.toHaveBeenCalled(); expect(f.images).toHaveLength(0)
  })
  it('missing or changed original key blocks resume with no network request', async () => {
    const f = await fixture(); const t = f.disk(); t.asyncGeneration!.slots[0] = { index: 0, phase: 'paused', remoteId: 'r0', results: [] }; f.set(t)
    f.deps.profile = () => ({ ...profile, apiKey: 'changed-key' })
    await f.runtime.run('local'); expect(queryAsyncImage).not.toHaveBeenCalled(); expect(f.disk().asyncGeneration!.slots[0].error).toContain('Key 已更换')
  })
  it('another tab holding the task lock prevents all network and save activity', async () => {
    const f = await fixture(); f.deps.lock = vi.fn(async () => undefined)
    await f.runtime.run('local', initial)
    expect(submitAsyncImage).not.toHaveBeenCalled(); expect(f.deps.commit).not.toHaveBeenCalled(); expect(f.deps.notify).toHaveBeenCalled()
  })
  it('manual download of known result is not another generation or query', async () => {
    const f = await fixture(); const t = f.disk(); t.asyncGeneration!.slots[0] = { index: 0, phase: 'paused', remoteId: 'r0', remoteStatus: 'completed', results: completed().results }; f.set(t)
    expect(await f.runtime.download('local', 0, 0)).toMatchObject({ dataUrl: 'pixels' })
    expect(downloadAsyncImage).toHaveBeenCalledOnce(); expect(submitAsyncImage).not.toHaveBeenCalled(); expect(queryAsyncImage).not.toHaveBeenCalled()
  })

  it('normalizes persisted pre-refresh submitting siblings without reposting them', async () => {
    const f = await fixture(2); const t = f.disk()
    t.asyncGeneration!.slots[0] = { index: 0, phase: 'polling', remoteId: 'r0', results: [] }
    t.asyncGeneration!.slots[1].phase = 'submitting'; f.set(t)
    await f.runtime.run('local')
    expect(f.disk().asyncGeneration!.slots.map(s => s.phase)).toEqual(['saved', 'unknown'])
    expect(f.disk().status).toBe('paused'); expect(submitAsyncImage).not.toHaveBeenCalled()
  })

  it('does not leave a permanent running card if browser locks are unavailable', async () => {
    const f = await fixture(); f.deps.lock = vi.fn(async () => { throw new Error('unsupported locks') })
    await f.runtime.run('local', initial)
    expect(f.disk().status).toBe('error'); expect(submitAsyncImage).not.toHaveBeenCalled()
  })

  it('preparation validation fails without submitting any paid request', async () => {
    const f = await fixture(2); vi.mocked(prepareAsyncImageRequest).mockRejectedValueOnce(new Error('mask missing'))
    await f.runtime.run('local', initial)
    expect(f.disk().status).toBe('error'); expect(submitAsyncImage).not.toHaveBeenCalled()
  })

  it('redacts credentials from failed query responses stored in task details', async () => {
    const f = await fixture()
    vi.mocked(queryAsyncImage).mockResolvedValueOnce({ status: 'failed', error: 'echo '+profile.apiKey, results: [], errorResponse: { status: 200, statusText: 'OK', body: profile.apiKey, truncated: false } })
    const op = f.runtime.run('local', initial); await flush(); await vi.advanceTimersByTimeAsync(5000); await op
    // Fingerprint is mocked for scheduler determinism; inspect user-visible errors only.
    expect(f.disk().asyncGeneration!.slots[0].error).not.toContain(profile.apiKey)
    expect(f.disk().asyncGeneration!.slots[0].errorResponse!.body).toBe('[REDACTED]')
  })
})
