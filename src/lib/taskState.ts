import type { TaskParams, TaskRecord } from '../types'

type ActualParams = Partial<TaskParams>
type TaskLifecyclePatch = Pick<TaskRecord, 'status' | 'error' | 'finishedAt' | 'elapsed'>

export function createTaskDonePatch(task: Pick<TaskRecord, 'createdAt'>, now: number): TaskLifecyclePatch {
  return {
    status: 'done',
    error: null,
    finishedAt: now,
    elapsed: Math.max(0, now - task.createdAt),
  }
}

export function createTaskErrorPatch(
  task: Pick<TaskRecord, 'createdAt'>,
  error: string,
  now: number,
): TaskLifecyclePatch {
  return {
    status: 'error',
    error,
    finishedAt: now,
    elapsed: Math.max(0, now - task.createdAt),
  }
}

export function markInterruptedOpenAIRunningTasks(tasks: TaskRecord[], now: number) {
  const interruptedTasks: TaskRecord[] = []
  const updatedTasks = tasks.map((task) => {
    const isOpenAITask = (task.apiProvider ?? 'openai') !== 'fal'
    if (task.status !== 'running' || !isOpenAITask || task.customTaskId) return task

    const updated: TaskRecord = {
      ...task,
      ...createTaskErrorPatch(task, '请求中断', now),
      falRecoverable: false,
    }
    interruptedTasks.push(updated)
    return updated
  })

  return { tasks: updatedTasks, interruptedTasks }
}

export function hasActualParams(params: ActualParams | undefined): params is ActualParams {
  return Boolean(params && Object.keys(params).length > 0)
}

export function firstActualParams(
  paramsList: Array<ActualParams | undefined> | undefined,
): ActualParams | undefined {
  return paramsList?.find(hasActualParams)
}

export function mapActualParamsByImage(
  outputIds: string[],
  paramsList: Array<ActualParams | undefined> | undefined,
) {
  const mapped = paramsList?.reduce<Record<string, ActualParams>>((acc, params, index) => {
    const imageId = outputIds[index]
    if (imageId && hasActualParams(params)) acc[imageId] = params
    return acc
  }, {})
  return mapped && Object.keys(mapped).length > 0 ? mapped : undefined
}

export function mapRevisedPromptsByImage(
  outputIds: string[],
  revisedPrompts: Array<string | undefined> | undefined,
) {
  const mapped = revisedPrompts?.reduce<Record<string, string>>((acc, prompt, index) => {
    const imageId = outputIds[index]
    if (imageId && prompt?.trim()) acc[imageId] = prompt
    return acc
  }, {})
  return mapped && Object.keys(mapped).length > 0 ? mapped : undefined
}
