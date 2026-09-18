import { describe, expect, it } from 'vitest'
import { pauseAsyncTask, summarizeAsyncTask } from './asyncTaskState'
import { markInterruptedRunningTasks } from './taskState'
import { DEFAULT_PARAMS, type TaskRecord } from '../types'

function task(): TaskRecord {
  return { id: 'a', prompt: 'cat', params: DEFAULT_PARAMS, inputImageIds: [], outputImages: [], status: 'running', error: null,
    createdAt: 1, elapsed: null, finishedAt: null, asyncGeneration: { protocol: 'cctq-images-v1', credentialFingerprint: 'digest', slots: [
      { index: 0, phase: 'polling', remoteId: 'remote', remoteStatus: 'queued', results: [] },
    ] } }
}
describe('async view state and refresh', () => {
  it('refresh leaves async records resumable without writing over another tab', () => {
    const record = task(); const result = markInterruptedRunningTasks([record], 100)
    expect(result.tasks[0].status).toBe('paused')
    expect(result.tasks[0].asyncGeneration!.slots[0].remoteId).toBe('remote')
    expect(result.interruptedTasks).toHaveLength(0)
    expect(record.status).toBe('running')
  })
  it('still marks legacy synchronous running records as interrupted', () => {
    const record = { ...task(), asyncGeneration: undefined }
    expect(markInterruptedRunningTasks([record], 100).interruptedTasks[0].status).toBe('error')
  })
  it('remote completed does not mean local saved', () => {
    const record = task(); record.asyncGeneration!.slots[0] = { index: 0, phase: 'downloading', remoteId: 'remote', remoteStatus: 'completed', results: [{ url: 'result' }] }
    expect(summarizeAsyncTask(record).status).toBe('running')
    expect(pauseAsyncTask(record).status).toBe('paused')
  })
  it('deduplicates saved outputs while preserving actual dimensions', () => {
    const record = task(); record.asyncGeneration!.slots = [0, 1].map(index => ({ index, phase: 'saved', results: [{ url: 'url'+index, imageId: 'hash', actualParams: { size: '1254x1254' } }] }))
    expect(summarizeAsyncTask(record)).toMatchObject({ status: 'done', outputImages: ['hash'], actualParams: { n: 1 }, actualParamsByImage: { hash: { size: '1254x1254' } } })
  })
})
