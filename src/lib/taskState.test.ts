import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type TaskRecord } from '../types'
import {
  createTaskDonePatch,
  createTaskErrorPatch,
  firstActualParams,
  mapActualParamsByImage,
  mapRevisedPromptsByImage,
  markInterruptedOpenAIRunningTasks,
} from './taskState'

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-a',
    prompt: 'prompt',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: [],
    outputImages: [],
    status: 'done',
    error: null,
    createdAt: 1_000,
    finishedAt: 2_000,
    elapsed: 1_000,
    ...overrides,
  }
}

describe('taskState', () => {
  it('creates stable done and error lifecycle patches', () => {
    expect(createTaskDonePatch(task(), 2_500)).toEqual({
      status: 'done',
      error: null,
      finishedAt: 2_500,
      elapsed: 1_500,
    })
    expect(createTaskErrorPatch(task(), 'failed', 500)).toEqual({
      status: 'error',
      error: 'failed',
      finishedAt: 500,
      elapsed: 0,
    })
  })

  it('interrupts only nonrecoverable OpenAI-compatible running tasks', () => {
    const legacy = task({ id: 'legacy', status: 'running', finishedAt: null, elapsed: null })
    const openai = task({ id: 'openai', apiProvider: 'openai', status: 'running', finishedAt: null, elapsed: null })
    const queued = task({ id: 'queued', apiProvider: 'custom', customTaskId: 'queue-1', status: 'running' })
    const fal = task({ id: 'fal', apiProvider: 'fal', status: 'running' })
    const done = task({ id: 'done' })

    const result = markInterruptedOpenAIRunningTasks([legacy, openai, queued, fal, done], 3_000)

    expect(result.interruptedTasks.map((item) => item.id)).toEqual(['legacy', 'openai'])
    expect(result.tasks.find((item) => item.id === 'legacy')).toMatchObject({
      status: 'error',
      error: '请求中断',
      finishedAt: 3_000,
      elapsed: 2_000,
      falRecoverable: false,
    })
    expect(result.tasks.find((item) => item.id === 'queued')).toEqual(queued)
    expect(result.tasks.find((item) => item.id === 'fal')).toEqual(fal)
    expect(result.tasks.find((item) => item.id === 'done')).toEqual(done)
  })

  it('maps actual params and revised prompts to matching image ids', () => {
    const params = [{ size: '1024x1024' }, undefined, { quality: 'high' as const }]

    expect(firstActualParams(params)).toEqual({ size: '1024x1024' })
    expect(mapActualParamsByImage(['a', 'b', 'c'], params)).toEqual({
      a: { size: '1024x1024' },
      c: { quality: 'high' },
    })
    expect(mapRevisedPromptsByImage(['a', 'b', 'c'], ['first', '  ', undefined])).toEqual({ a: 'first' })
    expect(mapActualParamsByImage(['a'], [undefined])).toBeUndefined()
    expect(mapRevisedPromptsByImage(['a'], [undefined])).toBeUndefined()
  })
})
