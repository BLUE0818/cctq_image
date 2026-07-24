import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS, type ExportData } from './types'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } from './lib/apiProfiles'
import * as db from './lib/db'
import { callImageApi } from './lib/api'
import type { TaskRecord } from './types'
import { clearFailedTasks, editOutputs, getPersistedState, getTaskApiProfile, importData, markInterruptedOpenAIRunningTasks, removeMultipleTasks, removeTask, reuseConfig, submitTask, taskMatchesFilterStatus, taskMatchesSearchQuery, useStore } from './store'

vi.mock('./lib/api', () => ({
  callImageApi: vi.fn(),
}))

vi.mock('./lib/db', () => ({
  CURRENT_THUMBNAIL_VERSION: 1,
  getAllTasks: vi.fn(async () => []),
  putTask: vi.fn(async () => undefined),
  deleteTask: vi.fn(async () => undefined),
  commitTaskDeletion: vi.fn(async () => undefined),
  clearTasks: vi.fn(async () => undefined),
  getImage: vi.fn(async () => null),
  getStoredImageThumbnail: vi.fn(async () => null),
  getImageThumbnail: vi.fn(async () => null),
  getStoredFreshImageThumbnail: vi.fn(async () => null),
  getAllImageIds: vi.fn(async () => []),
  getAllImages: vi.fn(async () => []),
  putImage: vi.fn(async () => undefined),
  putImageThumbnail: vi.fn(async () => undefined),
  deleteImage: vi.fn(async () => undefined),
  clearImages: vi.fn(async () => undefined),
  storeImage: vi.fn(async (dataUrl: string) => ({ id: dataUrl, dataUrl })),
}))

const imageA = { id: 'image-a', dataUrl: 'data:image/png;base64,a' }

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-a',
    prompt: 'prompt',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: [],
    maskTargetImageId: null,
    maskImageId: null,
    outputImages: [],
    status: 'done',
    error: null,
    createdAt: 1,
    finishedAt: 2,
    elapsed: 1,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('mask draft lifecycle in store actions', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      inputImages: [],
      maskDraft: null,
      maskEditorImageId: null,
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      detailTaskId: null,
      lightboxImageId: null,
      lightboxImageList: [],
      showSettings: false,
      toast: null,
      confirmDialog: null,
      showToast: vi.fn(),
      setConfirmDialog: vi.fn(),
    })
  })

  it('preserves an existing mask when quick edit-output adds outputs as references', async () => {
    const maskDraft = {
      targetImageId: imageA.id,
      maskDataUrl: 'data:image/png;base64,mask',
      updatedAt: 1,
    }
    useStore.setState({
      inputImages: [imageA],
      maskDraft,
    })

    await editOutputs(task({ outputImages: [imageA.id] }))

    expect(useStore.getState().maskDraft).toEqual(maskDraft)
  })

  it('clears an invalid mask draft when submit cannot find the mask target image', async () => {
    useStore.setState({
      inputImages: [imageA],
      maskDraft: {
        targetImageId: 'missing-image',
        maskDataUrl: 'data:image/png;base64,mask',
        updatedAt: 1,
      },
    })

    await submitTask()

    expect(useStore.getState().maskDraft).toBeNull()
  })

  it('replaces a reference image without clearing an unrelated mask', () => {
    const reference = { id: 'reference', dataUrl: 'data:image/png;base64,reference' }
    const replacement = { id: 'replacement', dataUrl: 'data:image/png;base64,replacement' }
    const maskDraft = { targetImageId: imageA.id, maskDataUrl: 'data:image/png;base64,mask', updatedAt: 1 }
    useStore.setState({ inputImages: [imageA, reference], maskDraft })

    useStore.getState().replaceInputImage(1, replacement)

    expect(useStore.getState().inputImages).toEqual([imageA, replacement])
    expect(useStore.getState().maskDraft).toEqual(maskDraft)
  })

  it('clears the mask when replacing its target image', () => {
    const replacement = { id: 'replacement', dataUrl: 'data:image/png;base64,replacement' }
    useStore.setState({
      inputImages: [imageA],
      maskDraft: { targetImageId: imageA.id, maskDataUrl: 'data:image/png;base64,mask', updatedAt: 1 },
      maskEditorImageId: imageA.id,
    })

    useStore.getState().replaceInputImage(0, replacement)

    expect(useStore.getState().inputImages).toEqual([replacement])
    expect(useStore.getState().maskDraft).toBeNull()
    expect(useStore.getState().maskEditorImageId).toBeNull()
  })
})

describe('interrupted OpenAI running tasks', () => {
  it('marks legacy and OpenAI running tasks as interrupted', () => {
    const now = 10_000
    const legacyRunning = task({ id: 'legacy-running', status: 'running', createdAt: 1_000, finishedAt: null, elapsed: null })
    const openAIRunning = task({ id: 'openai-running', apiProvider: 'openai', status: 'running', createdAt: 2_000, finishedAt: null, elapsed: null })
    const falRunning = task({ id: 'fal-running', apiProvider: 'fal', status: 'running', createdAt: 3_000, finishedAt: null, elapsed: null })
    const customAsyncRunning = task({ id: 'custom-running', apiProvider: 'custom-provider', customTaskId: 'task-1', status: 'running', createdAt: 4_000, finishedAt: null, elapsed: null })
    const doneTask = task({ id: 'done-task', apiProvider: 'openai', status: 'done' })

    const result = markInterruptedOpenAIRunningTasks([legacyRunning, openAIRunning, falRunning, customAsyncRunning, doneTask], now)

    expect(result.interruptedTasks.map((item) => item.id)).toEqual(['legacy-running', 'openai-running'])
    expect(result.tasks.find((item) => item.id === 'legacy-running')).toMatchObject({
      status: 'error',
      error: expect.stringContaining('请求中断'),
      finishedAt: now,
      elapsed: 9_000,
    })
    expect(result.tasks.find((item) => item.id === 'openai-running')).toMatchObject({
      status: 'error',
      error: expect.stringContaining('请求中断'),
      finishedAt: now,
      elapsed: 8_000,
    })
    expect(result.tasks.find((item) => item.id === 'fal-running')).toEqual(falRunning)
    expect(result.tasks.find((item) => item.id === 'custom-running')).toEqual(customAsyncRunning)
    expect(result.tasks.find((item) => item.id === 'done-task')).toEqual(doneTask)
  })
})

describe('input persistence setting', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      prompt: 'prompt',
      inputImages: [imageA],
      dismissedCodexCliPrompts: [],
    })
  })

  it('persists input when restart input restore is enabled', () => {
    const persisted = getPersistedState(useStore.getState())

    expect(persisted.prompt).toBe('prompt')
    expect(persisted.inputImages).toEqual([{ id: imageA.id, dataUrl: '' }])
  })

  it('omits input when restart input restore is disabled', () => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, persistInputOnRestart: false } })

    const persisted = getPersistedState(useStore.getState())

    expect(persisted).not.toHaveProperty('prompt')
    expect(persisted).not.toHaveProperty('inputImages')
  })

  it('writes empty input when persisted input is cleared', () => {
    useStore.setState({ prompt: '', inputImages: [] })

    const persisted = getPersistedState(useStore.getState())

    expect(persisted.prompt).toBe('')
    expect(persisted.inputImages).toEqual([])
  })
})

describe('reused task API profile', () => {
  const openaiProfile = createDefaultOpenAIProfile({ id: 'openai-profile', apiKey: 'openai-key' })
  const customProvider = {
    id: 'custom-image',
    name: '自定义配置',
    submit: {
      path: 'images/generations',
      method: 'POST' as const,
      contentType: 'json' as const,
      body: { model: '$profile.model', prompt: '$prompt' },
      result: { imageUrlPaths: ['data.*.url'], b64JsonPaths: ['data.*.b64_json'] },
    },
  }
  const customProfile = ({
    id: 'custom-profile',
    name: '自定义配置',
    provider: customProvider.id,
    baseUrl: 'https://www.cctq.ai/v1',
    apiKey: 'custom-key',
    model: 'custom-model',
    timeout: 600,
    codexCli: false,
    apiProxy: false,
  })

  beforeEach(() => {
    useStore.setState({
      settings: normalizeSettings({
        ...DEFAULT_SETTINGS,
        customProviders: [customProvider],
        profiles: [openaiProfile, customProfile],
        activeProfileId: openaiProfile.id,
        reuseTaskApiProfileTemporarily: true,
      }),
      prompt: '',
      inputImages: [],
      maskDraft: null,
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      showSettings: false,
      toast: null,
      reusedTaskApiProfileId: null,
      reusedTaskApiProfileName: null,
      reusedTaskApiProfileMissing: false,
      showToast: vi.fn(),
      setConfirmDialog: vi.fn(),
    })
  })

  it('resolves a task API profile by stored profile id', () => {
    const resolved = getTaskApiProfile(useStore.getState().settings, task({ apiProvider: customProvider.id, apiProfileId: customProfile.id }))

    expect(resolved?.id).toBe(customProfile.id)
  })

  it('does not resolve a task API profile by stored name or model', () => {
    const resolved = getTaskApiProfile(useStore.getState().settings, task({
      apiProvider: customProvider.id,
      apiProfileName: customProfile.name,
      apiModel: customProfile.model,
    }))

    expect(resolved).toBeNull()
  })

  it('reuses the task API profile temporarily without switching the active profile', async () => {
    await reuseConfig(task({
      apiProvider: customProvider.id,
      apiProfileId: customProfile.id,
      params: { ...DEFAULT_PARAMS, n: 8, size: 'auto', quality: 'auto' },
    }))

    const state = useStore.getState()
    expect(state.settings.activeProfileId).toBe(openaiProfile.id)
    expect(state.reusedTaskApiProfileId).toBe(customProfile.id)
    expect(state.params).toMatchObject({ n: 8, size: 'auto', quality: 'auto' })
    expect(state.showToast).toHaveBeenCalledWith('已临时复用该任务的 API 配置「自定义配置」', 'success')
  })

  it('clears temporary reuse when switching current settings to the reused API profile', async () => {
    await reuseConfig(task({ apiProvider: customProvider.id, apiProfileId: customProfile.id }))

    useStore.getState().setSettings({ activeProfileId: customProfile.id })

    const state = useStore.getState()
    expect(state.settings.activeProfileId).toBe(customProfile.id)
    expect(state.reusedTaskApiProfileId).toBeNull()
    expect(state.reusedTaskApiProfileMissing).toBe(false)
  })

  it('normalizes reused params to the current API profile when temporary reuse is disabled', async () => {
    useStore.setState({
      settings: normalizeSettings({
        ...useStore.getState().settings,
        reuseTaskApiProfileTemporarily: false,
      }),
    })

    await reuseConfig(task({
      apiProvider: customProvider.id,
      apiProfileId: customProfile.id,
      params: { ...DEFAULT_PARAMS, n: 8, size: 'auto', quality: 'auto' },
    }))

    const state = useStore.getState()
    expect(state.settings.activeProfileId).toBe(openaiProfile.id)
    expect(state.reusedTaskApiProfileId).toBeNull()
    expect(state.params).toMatchObject({ n: 8, size: 'auto', quality: 'auto' })
  })

  it('asks whether to submit with current API profile when the reused API profile is missing', async () => {
    await reuseConfig(task({ apiProvider: customProvider.id, apiProfileId: 'missing-profile' }))

    const state = useStore.getState()
    expect(state.tasks).toEqual([])
    expect(state.setConfirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: '找不到 API 配置',
      message: '找不到复用任务所使用的 API 配置「未知配置」，要使用当前的 API 配置「默认」提交任务吗？',
      confirmText: '使用当前配置提交',
      cancelText: '放弃提交',
    }))
    expect(state.showSettings).toBe(false)
  })
})

describe('failed task cleanup', () => {
  beforeEach(() => {
    useStore.setState({
      tasks: [],
      selectedTaskIds: [],
      inputImages: [],
      showToast: vi.fn(),
    })
  })

  it('clears only failed tasks', async () => {
    const failedA = task({ id: 'failed-a', status: 'error', error: '生成失败', outputImages: ['failed-image-a'] })
    const failedB = task({ id: 'failed-b', status: 'error', error: '生成失败', outputImages: ['failed-image-b'] })
    const done = task({ id: 'done-task', status: 'done', outputImages: ['done-image'] })
    const running = task({ id: 'running-task', status: 'running', finishedAt: null, elapsed: null })
    useStore.setState({
      tasks: [failedA, done, failedB, running],
      selectedTaskIds: ['failed-a', 'done-task', 'failed-b'],
    })

    await clearFailedTasks()

    const state = useStore.getState()
    expect(state.tasks.map((item) => item.id)).toEqual(['done-task', 'running-task'])
    expect(state.selectedTaskIds).toEqual(['done-task'])
    expect(state.showToast).toHaveBeenCalledWith('已删除 2 条记录', 'success')
  })

  it('matches partial failures in failed filters and searches error text', () => {
    const partial = task({
      id: 'partial-task',
      status: 'done',
      outputImages: ['done-image-a', 'done-image-b'],
      outputErrors: [{ requestIndex: 2, error: 'Failed to fetch' }],
    })

    expect(taskMatchesFilterStatus(partial, 'error')).toBe(true)
    expect(taskMatchesFilterStatus(partial, 'done')).toBe(true)
    expect(taskMatchesSearchQuery(partial, 'failed to fetch')).toBe(true)
  })

  it('clears partial failure markers without deleting successful outputs', async () => {
    const partial = task({
      id: 'partial-task',
      status: 'done',
      outputImages: ['done-image-a'],
      outputErrors: [{ requestIndex: 1, error: 'Failed to fetch' }],
    })
    useStore.setState({ tasks: [partial], selectedTaskIds: ['partial-task'] })

    await clearFailedTasks(['partial-task'])

    const state = useStore.getState()
    expect(state.tasks).toHaveLength(1)
    expect(state.tasks[0]).toMatchObject({ id: 'partial-task', outputImages: ['done-image-a'], outputErrors: undefined })
    expect(state.selectedTaskIds).toEqual([])
    expect(state.showToast).toHaveBeenCalledWith('已清除 1 条部分失败记录', 'success')
  })
})

describe('task deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      selectedTaskIds: [],
      inputImages: [],
      detailTaskId: null,
      showToast: vi.fn(),
    })
  })

  it('removes a single task from tasks and selection', async () => {
    const deleted = task({ id: 'deleted', outputImages: ['deleted-image'] })
    const remaining = task({ id: 'remaining' })
    useStore.setState({
      tasks: [deleted, remaining],
      selectedTaskIds: [deleted.id, remaining.id],
      detailTaskId: deleted.id,
      lightboxImageId: 'deleted-image',
      lightboxImageList: ['deleted-image'],
    })

    await removeTask(deleted)

    expect(useStore.getState().tasks).toEqual([remaining])
    expect(useStore.getState().selectedTaskIds).toEqual([remaining.id])
    expect(useStore.getState().detailTaskId).toBeNull()
    expect(useStore.getState().lightboxImageId).toBeNull()
    expect(useStore.getState().lightboxImageList).toEqual([])
    expect(db.commitTaskDeletion).toHaveBeenCalledWith([deleted.id])
    expect(useStore.getState().showToast).toHaveBeenCalledWith('记录已删除', 'success')
  })

  it('counts duplicate and missing ids only when they match existing tasks', async () => {
    const deleted = task({ id: 'deleted' })
    const remaining = task({ id: 'remaining' })
    useStore.setState({ tasks: [deleted, remaining], selectedTaskIds: [deleted.id, 'missing'] })

    await removeMultipleTasks([deleted.id, deleted.id, 'missing'])

    expect(useStore.getState().tasks).toEqual([remaining])
    expect(useStore.getState().selectedTaskIds).toEqual([])
    expect(db.commitTaskDeletion).toHaveBeenCalledWith([deleted.id])
    expect(useStore.getState().showToast).toHaveBeenCalledWith('已删除 1 条记录', 'success')
  })

  it('keeps images that are still referenced by remaining tasks or input', async () => {
    const deleted = task({ id: 'deleted', outputImages: ['shared-task', 'shared-input', 'orphan'] })
    const remaining = task({ id: 'remaining', inputImageIds: ['shared-task'] })
    useStore.setState({
      tasks: [deleted, remaining],
      inputImages: [{ id: 'shared-input', dataUrl: 'data:image/png;base64,input' }],
    })

    await removeTask(deleted)

    expect(db.deleteImage).toHaveBeenCalledTimes(1)
    expect(db.deleteImage).toHaveBeenCalledWith('orphan')
  })

  it('preserves task creation and updates while deletion persistence is pending', async () => {
    const commit = deferred<undefined>()
    vi.mocked(db.commitTaskDeletion).mockReturnValueOnce(commit.promise)
    const deleted = task({ id: 'deleted' })
    const existing = task({ id: 'existing' })
    const created = task({ id: 'created' })
    useStore.setState({ tasks: [deleted, existing] })

    const deleting = removeTask(deleted)
    useStore.setState((state) => ({
      tasks: [created, ...state.tasks.map((item) => item.id === existing.id ? { ...item, prompt: 'updated' } : item)],
    }))
    commit.resolve(undefined)
    await deleting

    expect(useStore.getState().tasks.map((item) => item.id)).toEqual([created.id, existing.id])
    expect(useStore.getState().tasks.find((item) => item.id === existing.id)?.prompt).toBe('updated')
  })

  it('removes output images that arrive after the task is deleted', async () => {
    const request = deferred<Awaited<ReturnType<typeof callImageApi>>>()
    const imageStore = deferred<string>()
    vi.mocked(callImageApi).mockReturnValueOnce(request.promise)
    vi.mocked(db.storeImage).mockReturnValueOnce(imageStore.promise)

    await submitTask()
    await vi.waitFor(() => expect(callImageApi).toHaveBeenCalledOnce())
    const running = useStore.getState().tasks[0]
    request.resolve({
      images: ['late-output'],
      actualParams: {},
      actualParamsList: [{}],
      revisedPrompts: [],
    })
    await vi.waitFor(() => expect(db.storeImage).toHaveBeenCalledWith('late-output', 'generated'))
    await removeTask(running)
    imageStore.resolve('late-output')

    await vi.waitFor(() => expect(db.deleteImage).toHaveBeenCalledWith('late-output'))
    expect(useStore.getState().tasks).toEqual([])
    expect(useStore.getState().detailTaskId).toBeNull()
  })

  it('restores an image when a new reference appears during deletion', async () => {
    vi.mocked(db.getImage).mockResolvedValueOnce({
      id: 'referenced-late',
      dataUrl: 'data:image/png;base64,original',
      createdAt: 1,
      source: 'generated',
    })
    vi.mocked(db.deleteImage).mockImplementationOnce(async () => {
      useStore.setState({ tasks: [task({ id: 'new-task', inputImageIds: ['referenced-late'] })] })
    })
    const deleted = task({ id: 'deleted', outputImages: ['referenced-late'] })
    useStore.setState({ tasks: [deleted] })

    await removeTask(deleted)

    expect(db.putImage).toHaveBeenCalledWith(expect.objectContaining({ id: 'referenced-late' }))
  })
})

function importFile(manifest: ExportData, files: Record<string, Uint8Array> = {}) {
  const bytes = zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    ...files,
  })
  const buffer = bytes.slice().buffer as ArrayBuffer
  return {
    name: 'backup.zip',
    size: bytes.byteLength,
    arrayBuffer: vi.fn(async () => buffer),
  } as unknown as File
}

describe('multipart data import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useStore.setState({
      tasks: [],
      showToast: vi.fn(),
    })
  })

  it('imports a complete multipart backup selected in any order', async () => {
    const part1 = importFile({
      version: 3,
      exportedAt: new Date(0).toISOString(),
      backupPart: { id: 'backup-a', index: 1, total: 2 },
      tasks: [task({ id: 'multipart-task-a' })],
      imageFiles: {},
    })
    const part2 = importFile({
      version: 3,
      exportedAt: new Date(0).toISOString(),
      backupPart: { id: 'backup-a', index: 2, total: 2 },
      tasks: [task({ id: 'multipart-task-b' })],
      imageFiles: {},
    })

    await expect(importData([part2, part1], { importConfig: false, importTasks: true })).resolves.toBe(true)
    expect(vi.mocked(db.putTask).mock.calls.map(([item]) => item.id)).toEqual(['multipart-task-a', 'multipart-task-b'])
  })

  it('imports multiple regular backups together', async () => {
    const backupA = importFile({
      version: 3,
      exportedAt: new Date(0).toISOString(),
      tasks: [task({ id: 'regular-task-a' })],
      imageFiles: {},
    })
    const backupB = importFile({
      version: 3,
      exportedAt: new Date(1).toISOString(),
      tasks: [task({ id: 'regular-task-b' })],
      imageFiles: {},
    })

    await expect(importData([backupA, backupB], { importConfig: false, importTasks: true })).resolves.toBe(true)
    expect(vi.mocked(db.putTask).mock.calls.map(([item]) => item.id)).toEqual(['regular-task-a', 'regular-task-b'])
    expect(useStore.getState().showToast).toHaveBeenCalledWith('已导入 2 条记录', 'success')
  })

  it('merges and deduplicates settings from multiple regular backups', async () => {
    useStore.setState({ settings: normalizeSettings(DEFAULT_SETTINGS) })
    const shared = createDefaultOpenAIProfile({ id: 'shared', name: '共享', apiKey: 'shared-key' })
    const profileA = createDefaultOpenAIProfile({ id: 'profile-a', name: '配置 A', apiKey: 'key-a' })
    const profileB = createDefaultOpenAIProfile({ id: 'profile-b', name: '配置 B', apiKey: 'key-b' })
    const backupA = importFile({
      version: 3,
      exportedAt: new Date(0).toISOString(),
      settings: normalizeSettings({ ...DEFAULT_SETTINGS, profiles: [shared, profileA], activeProfileId: profileA.id }),
    })
    const backupB = importFile({
      version: 3,
      exportedAt: new Date(1).toISOString(),
      settings: normalizeSettings({ ...DEFAULT_SETTINGS, profiles: [shared, profileB], activeProfileId: profileB.id }),
    })

    await expect(importData([backupA, backupB], { importConfig: true, importTasks: false })).resolves.toBe(true)
    const apiKeys = useStore.getState().settings.profiles.map((profile) => profile.apiKey)
    expect(apiKeys).toEqual(expect.arrayContaining(['shared-key', 'key-a', 'key-b']))
    expect(apiKeys.filter((apiKey) => apiKey === 'shared-key')).toHaveLength(1)
  })

  it('rejects an incomplete multipart backup before writing data', async () => {
    const part1 = importFile({
      version: 3,
      exportedAt: new Date(0).toISOString(),
      backupPart: { id: 'backup-a', index: 1, total: 2 },
      tasks: [task({ id: 'multipart-task-a' })],
      imageFiles: {},
    })

    await expect(importData([part1], { importConfig: false, importTasks: true })).resolves.toBe(false)
    expect(db.putTask).not.toHaveBeenCalled()
    expect(db.putImage).not.toHaveBeenCalled()
  })

  it('validates every selected part before writing earlier parts', async () => {
    const part1 = importFile({
      version: 3,
      exportedAt: new Date(0).toISOString(),
      backupPart: { id: 'backup-a', index: 1, total: 2 },
      tasks: [task({ id: 'multipart-task-a' })],
      imageFiles: { 'image-a': { path: 'images/image-a.png' } },
    }, { 'images/image-a.png': new Uint8Array([1, 2]) })
    const part2 = importFile({
      version: 3,
      exportedAt: new Date(0).toISOString(),
      backupPart: { id: 'backup-a', index: 2, total: 2 },
      tasks: [task({ id: 'multipart-task-b' })],
      imageFiles: { missing: { path: 'images/missing.png' } },
    })

    await expect(importData([part1, part2], { importConfig: false, importTasks: true })).resolves.toBe(false)
    expect(db.putTask).not.toHaveBeenCalled()
    expect(db.putImage).not.toHaveBeenCalled()
  })

  it('blocks task imports while supported work is active', async () => {
    const file = importFile({
      version: 3,
      exportedAt: new Date(0).toISOString(),
      tasks: [task({ id: 'imported-task' })],
    })
    useStore.setState({ tasks: [task({ status: 'running' })] })

    await expect(importData(file, { importConfig: false, importTasks: true })).resolves.toBe(false)
    expect(file.arrayBuffer).not.toHaveBeenCalled()
    expect(db.putTask).not.toHaveBeenCalled()
  })
})
