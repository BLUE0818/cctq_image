import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ApiProfile,
  AppSettings,
  TaskParams,
  InputImage,
  MaskDraft,
  TaskRecord,
  StoredImageThumbnail,
} from './types'
import { DEFAULT_PARAMS } from './types'
import { DEFAULT_SETTINGS, getActiveApiProfile, mergeImportedSettings, normalizeSettings, validateApiProfile } from './lib/apiProfiles'
import { replaceImageMentionsForApi } from './lib/promptImageMentions'
import { moveDraftImage, orderImagesWithMaskFirst, removeDraftImage, replaceDraftImage, setDraftImages } from './lib/inputDraftState'
import { encodePersistedState, mergePersistedState } from './lib/persistedState'
import {
  getAllTasks,
  getTask,
  commitAsyncTask,
  hashDataUrl,
  putTask,
  deleteTask as dbDeleteTask,
  commitTaskDeletion,
  clearTasks as dbClearTasks,
  getImage,
  getStoredImageThumbnail,
  getImageThumbnail,
  getAllImageIds,
  getAllImages,
  putImage,
  putImageThumbnail,
  deleteImage,
  clearImages,
  storeImage,
} from './lib/db'
import { AsyncImageRuntime, browserTaskLock } from './lib/asyncImageRuntime'
import { credentialFingerprint } from './lib/asyncImageApi'
import { isAsyncTask, pauseAsyncTask, summarizeAsyncTask, visibleAsyncSlots } from './lib/asyncTaskState'
import { validateMaskMatchesImage } from './lib/canvasImage'
import { orderInputImagesForMask } from './lib/mask'
import { getChangedParams, normalizeParamsForSettings } from './lib/paramCompatibility'
import { hasActiveDataOperations } from './lib/dataOperations'
import { formatExportFileTime, downloadImageIds } from './lib/downloadImages'
import {
  buildExportZip,
  createExportBlob,
  getExportImageEstimatedBytes,
  getExportZipPlan,
  MAX_EXPORT_ZIP_BYTES,
  readExportZip,
  readExportZipFileAsDataUrl,
  readExportZipManifest,
} from './lib/exportZip'
import {
  cacheImage,
  cacheThumbnail,
  clearImageCaches,
  deleteCachedImage,
  deleteImageCacheEntry,
  ensureImageCached,
  scheduleThumbnailBackfill,
} from './lib/imageCache'
import {
  markInterruptedRunningTasks,
} from './lib/taskState'

export {
  ensureImageCached,
  ensureImageThumbnailCached,
  getCachedImage,
  subscribeImageThumbnail,
} from './lib/imageCache'
export { markInterruptedRunningTasks } from './lib/taskState'

export function getPersistedState(state: AppState) {
  return encodePersistedState(state)
}

// ===== Store 类型 =====

interface AppState {
  // 设置
  settings: AppSettings
  setSettings: (s: Partial<AppSettings>) => void
  dismissedCodexCliPrompts: string[]
  dismissCodexCliPrompt: (key: string) => void

  // 输入
  prompt: string
  setPrompt: (p: string) => void
  inputImages: InputImage[]
  addInputImage: (img: InputImage) => void
  replaceInputImage: (idx: number, img: InputImage) => void
  removeInputImage: (idx: number) => void
  clearInputImages: () => void
  setInputImages: (imgs: InputImage[]) => void
  moveInputImage: (fromIdx: number, toIdx: number) => void
  maskDraft: MaskDraft | null
  setMaskDraft: (draft: MaskDraft | null) => void
  clearMaskDraft: () => void
  maskEditorImageId: string | null
  setMaskEditorImageId: (id: string | null) => void

  // 参数
  params: TaskParams
  setParams: (p: Partial<TaskParams>) => void
  reusedTaskApiProfileId: string | null
  reusedTaskApiProfileName: string | null
  reusedTaskApiProfileMissing: boolean
  setReusedTaskApiProfile: (profileId: string | null, missing?: boolean, profileName?: string | null) => void

  // 任务列表
  tasks: TaskRecord[]
  setTasks: (t: TaskRecord[]) => void

  // 搜索和筛选
  searchQuery: string
  setSearchQuery: (q: string) => void
  filterStatus: 'all' | 'running' | 'done' | 'error'
  setFilterStatus: (status: AppState['filterStatus']) => void
  filterFavorite: boolean
  setFilterFavorite: (f: boolean) => void

  // 多选
  selectedTaskIds: string[]
  setSelectedTaskIds: (ids: string[] | ((prev: string[]) => string[])) => void
  toggleTaskSelection: (id: string, force?: boolean) => void
  clearSelection: () => void

  // UI
  detailTaskId: string | null
  setDetailTaskId: (id: string | null) => void
  lightboxImageId: string | null
  lightboxImageList: string[]
  setLightboxImageId: (id: string | null, list?: string[]) => void
  showSettings: boolean
  setShowSettings: (v: boolean) => void

  // Toast
  toast: { message: string; type: 'info' | 'success' | 'error' } | null
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void

  // Confirm dialog
  confirmDialog: {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    showCancel?: boolean
    icon?: 'info' | 'copy'
    minConfirmDelayMs?: number
    messageAlign?: 'left' | 'center'
    tone?: 'danger' | 'warning'
    action: () => void
    cancelAction?: () => void
  } | null
  setConfirmDialog: (d: AppState['confirmDialog']) => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Settings
      settings: { ...DEFAULT_SETTINGS },
      setSettings: (s) => set((st) => {
        const previous = normalizeSettings(st.settings)
        const incoming = s as Partial<AppSettings>
        const hasLegacyOverrides =
          incoming.baseUrl !== undefined ||
          incoming.apiKey !== undefined ||
          incoming.model !== undefined ||
          incoming.timeout !== undefined ||
          incoming.codexCli !== undefined ||
          incoming.apiProxy !== undefined
        const merged = normalizeSettings({ ...previous, ...incoming })
        if (hasLegacyOverrides && incoming.profiles === undefined) {
          merged.profiles = merged.profiles.map((profile) =>
            profile.id === merged.activeProfileId
              ? {
                  ...profile,
                  baseUrl: incoming.baseUrl ?? profile.baseUrl,
                  apiKey: incoming.apiKey ?? profile.apiKey,
                  model: incoming.model ?? profile.model,
                  timeout: incoming.timeout ?? profile.timeout,
                  codexCli: incoming.codexCli ?? profile.codexCli,
                  apiProxy: incoming.apiProxy ?? profile.apiProxy,
                }
              : profile,
          )
        }
        const settings = normalizeSettings(merged)
        const shouldClearReusedProfile = st.reusedTaskApiProfileId && settings.activeProfileId === st.reusedTaskApiProfileId
        return {
          settings,
          ...(shouldClearReusedProfile
            ? { reusedTaskApiProfileId: null, reusedTaskApiProfileName: null, reusedTaskApiProfileMissing: false }
            : {}),
        }
      }),
      dismissedCodexCliPrompts: [],
      dismissCodexCliPrompt: (key) => set((st) => ({
        dismissedCodexCliPrompts: st.dismissedCodexCliPrompts.includes(key)
          ? st.dismissedCodexCliPrompts
          : [...st.dismissedCodexCliPrompts, key],
      })),

      // Input
      prompt: '',
      setPrompt: (prompt) => set({ prompt }),
      inputImages: [],
      addInputImage: (img) =>
        set((s) => {
          if (s.inputImages.find((i) => i.id === img.id)) return s
          return { inputImages: [...s.inputImages, img] }
        }),
      replaceInputImage: (idx, img) =>
        set((s) => {
          return replaceDraftImage(s, idx, img) ?? s
        }),
      removeInputImage: (idx) =>
        set((s) => removeDraftImage(s, idx)),
      clearInputImages: () =>
        set((s) => {
          for (const img of s.inputImages) deleteCachedImage(img.id)
          return { inputImages: [], maskDraft: null, maskEditorImageId: null }
        }),
      setInputImages: (imgs) =>
        set((s) => setDraftImages(s, imgs)),
      moveInputImage: (fromIdx, toIdx) =>
        set((s) => {
          const inputImages = moveDraftImage(s, fromIdx, toIdx)
          return inputImages ? { inputImages } : s
        }),
      maskDraft: null,
      setMaskDraft: (maskDraft) =>
        set((s) => ({
          maskDraft,
          inputImages: orderImagesWithMaskFirst(s.inputImages, maskDraft?.targetImageId),
        })),
      clearMaskDraft: () => set({ maskDraft: null }),
      maskEditorImageId: null,
      setMaskEditorImageId: (maskEditorImageId) => set({ maskEditorImageId }),

      // Params
      params: { ...DEFAULT_PARAMS },
      setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
      reusedTaskApiProfileId: null,
      reusedTaskApiProfileName: null,
      reusedTaskApiProfileMissing: false,
      setReusedTaskApiProfile: (profileId, missing = false, profileName = null) => set({
        reusedTaskApiProfileId: profileId,
        reusedTaskApiProfileName: profileName,
        reusedTaskApiProfileMissing: missing,
      }),

      // Tasks
      tasks: [],
      setTasks: (tasks) => set({ tasks }),

      // Search & Filter
      searchQuery: '',
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      filterStatus: 'all',
      setFilterStatus: (filterStatus) => set({ filterStatus }),
      filterFavorite: false,
      setFilterFavorite: (filterFavorite) => set({ filterFavorite }),

      // Selection
      selectedTaskIds: [],
      setSelectedTaskIds: (updater) => set((s) => ({
        selectedTaskIds: typeof updater === 'function' ? updater(s.selectedTaskIds) : updater
      })),
      toggleTaskSelection: (id, force) => set((s) => {
        const isSelected = s.selectedTaskIds.includes(id)
        const shouldSelect = force !== undefined ? force : !isSelected
        if (shouldSelect === isSelected) return s
        return {
          selectedTaskIds: shouldSelect
            ? [...s.selectedTaskIds, id]
            : s.selectedTaskIds.filter((x) => x !== id)
        }
      }),
      clearSelection: () => set({ selectedTaskIds: [] }),

      // UI
      detailTaskId: null,
      setDetailTaskId: (detailTaskId) => set({ detailTaskId }),
      lightboxImageId: null,
      lightboxImageList: [],
      setLightboxImageId: (lightboxImageId, list) =>
        set({ lightboxImageId, lightboxImageList: list ?? (lightboxImageId ? [lightboxImageId] : []) }),
      showSettings: false,
      setShowSettings: (showSettings) => set({ showSettings }),

      // Toast
      toast: null,
      showToast: (message, type = 'info') => {
        set({ toast: { message, type } })
        setTimeout(() => {
          set((s) => (s.toast?.message === message ? { toast: null } : s))
        }, 3000)
      },

      // Confirm
      confirmDialog: null,
      setConfirmDialog: (confirmDialog) => set({ confirmDialog }),
    }),
    {
      name: 'cctq-image',
      partialize: getPersistedState,
      merge: mergePersistedState,
      onRehydrateStorage: () => (state) => {
        if (state) state.setSettings(state.settings)
      },
    },
  ),
)

// ===== Actions =====

let uid = 0
function genId(): string {
  return Date.now().toString(36) + (++uid).toString(36) + Math.random().toString(36).slice(2, 6)
}

export function getCodexCliPromptKey(settings: AppSettings): string {
  const profile = getActiveApiProfile(settings)
  return `${profile.baseUrl}\n${profile.apiKey}`
}

export function taskHasOutputErrors(task: Pick<TaskRecord, 'outputErrors'>) {
  return Boolean(task.outputErrors?.length)
}

export function taskMatchesFilterStatus(task: TaskRecord, filterStatus: AppState['filterStatus']) {
  if (filterStatus === 'all') return true
  if (filterStatus === 'running') return task.status === 'running' || task.status === 'paused'
  if (filterStatus === 'error') return task.status === 'error' || taskHasOutputErrors(task)
  return task.status === filterStatus
}

export function taskMatchesSearchQuery(task: TaskRecord, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const prompt = (task.prompt || '').toLowerCase()
  const paramStr = JSON.stringify(task.params).toLowerCase()
  const errorStr = [task.error, ...(task.outputErrors ?? []).map((item) => item.error)].filter(Boolean).join('\n').toLowerCase()
  const asyncStr = JSON.stringify(visibleAsyncSlots(task)).toLowerCase()
  return prompt.includes(q) || paramStr.includes(q) || errorStr.includes(q) || asyncStr.includes(q)
}

export function showCodexCliPrompt(force = false, reason = '接口返回的提示词已被改写') {
  const state = useStore.getState()
  const settings = state.settings
  const promptKey = getCodexCliPromptKey(settings)
  if (!force && (settings.codexCli || state.dismissedCodexCliPrompts.includes(promptKey))) return

  state.setConfirmDialog({
    title: '检测到 Codex CLI API',
    message: `${reason}，当前 API 来源很可能是 Codex CLI。\n\n是否开启 Codex CLI 兼容模式？开启后会禁用在此处无效的质量参数，并在 Images API 多图生成时使用并发请求，解决该 API 数量参数无效的问题。同时，提示词文本开头会加入简短的不改写要求，避免模型重写提示词，偏离原意。`,
    confirmText: '开启',
    action: () => {
      const state = useStore.getState()
      state.dismissCodexCliPrompt(promptKey)
      state.setSettings({ codexCli: true })
    },
    cancelAction: () => useStore.getState().dismissCodexCliPrompt(promptKey),
  })
}

export function getTaskApiProfile(settings: AppSettings, task: TaskRecord): ApiProfile | null {
  const normalized = normalizeSettings(settings)
  const provider = task.apiProvider

  if (!task.apiProfileId) return null

  const byId = normalized.profiles.find((profile) => profile.id === task.apiProfileId)
  if (byId && (!provider || byId.provider === provider)) return byId
  return null
}

function createSettingsForApiProfile(settings: AppSettings, profile: ApiProfile): AppSettings {
  const normalized = normalizeSettings(settings)
  return normalizeSettings({
    ...normalized,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
    timeout: profile.timeout,
    codexCli: profile.codexCli,
    apiProxy: profile.apiProxy,
    profiles: normalized.profiles.map((item) => item.id === profile.id ? profile : item),
    activeProfileId: profile.id,
  })
}

function getReusedTaskApiProfile(settings: AppSettings, profileId: string | null): ApiProfile | null {
  if (!profileId) return null
  return normalizeSettings(settings).profiles.find((profile) => profile.id === profileId) ?? null
}

function getTaskApiProfileName(task: TaskRecord) {
  return task.apiProfileName || task.apiModel || '未知配置'
}

/** 初始化：从 IndexedDB 加载任务，按需恢复输入图片，并清理孤立图片 */
export async function initStore() {
  const storedTasks = await getAllTasks()
  const { tasks, interruptedTasks } = markInterruptedRunningTasks(storedTasks, Date.now())
  await Promise.all(interruptedTasks.map((task) => putTask(task)))
  useStore.getState().setTasks(tasks)

  // 收集所有任务引用的图片 id
  const referencedIds = new Set<string>()
  const persistedInputImages = useStore.getState().inputImages
  for (const img of persistedInputImages) referencedIds.add(img.id)
  for (const t of tasks) {
    for (const id of t.inputImageIds || []) referencedIds.add(id)
    if (t.maskImageId) referencedIds.add(t.maskImageId)
    for (const id of t.outputImages || []) {
      referencedIds.add(id)
    }
  }

  // 只枚举 key 清理孤立图片，避免启动时把所有 4K 原图读进内存。
  const imageIds = await getAllImageIds()
  const referencedImageIds: string[] = []
  for (const imgId of imageIds) {
    if (referencedIds.has(imgId)) {
      referencedImageIds.push(imgId)
    } else if (!tasks.some(isAsyncTask)) {
      // Another tab can commit a new async output after our startup snapshot.
      await deleteImage(imgId)
    }
  }
  scheduleThumbnailBackfill(referencedImageIds)

  const restoredInputImages: InputImage[] = []
  for (const img of persistedInputImages) {
    if (img.dataUrl) {
      restoredInputImages.push(img)
      cacheImage(img.id, img.dataUrl)
      continue
    }
    const storedImage = await getImage(img.id)
    if (storedImage?.dataUrl) {
      restoredInputImages.push({ ...img, dataUrl: storedImage.dataUrl })
      cacheImage(img.id, storedImage.dataUrl)
    }
  }
  if (restoredInputImages.length !== persistedInputImages.length || restoredInputImages.some((img, index) => img.dataUrl !== persistedInputImages[index]?.dataUrl)) {
    useStore.getState().setInputImages(restoredInputImages)
  }
}

/** 提交新任务 */
export async function submitTask(options: { allowFullMask?: boolean; useCurrentApiProfileWhenReusedMissing?: boolean } = {}) {
  const { settings, prompt, inputImages, maskDraft, params, reusedTaskApiProfileId, reusedTaskApiProfileName, reusedTaskApiProfileMissing, showToast, setConfirmDialog } =
    useStore.getState()

  const normalizedSettings = normalizeSettings(settings)
  let activeProfile = getActiveApiProfile(settings)
  let requestSettings = createSettingsForApiProfile(normalizedSettings, activeProfile)
  if (normalizedSettings.reuseTaskApiProfileTemporarily && (reusedTaskApiProfileId || reusedTaskApiProfileMissing)) {
    const reusedProfile = getReusedTaskApiProfile(normalizedSettings, reusedTaskApiProfileId)
    if (!reusedProfile) {
      if (options.useCurrentApiProfileWhenReusedMissing) {
        useStore.getState().setReusedTaskApiProfile(null)
      } else {
        setConfirmDialog({
          title: '找不到 API 配置',
      message: `找不到复用任务所使用的 API 配置「${reusedTaskApiProfileName || '未知配置'}」，要使用当前的 API 配置「${activeProfile.name}」提交任务吗？`,
      confirmText: '使用当前配置提交',
      cancelText: '放弃提交',
      action: () => {
        void submitTask({ ...options, useCurrentApiProfileWhenReusedMissing: true })
      },
        })
        return
      }
    } else {
      activeProfile = reusedProfile
      requestSettings = createSettingsForApiProfile(normalizedSettings, reusedProfile)
    }
  }

  if (validateApiProfile(activeProfile)) {
    showToast(`请先完善请求 API 配置：${validateApiProfile(activeProfile)}`, 'error')
    useStore.getState().setShowSettings(true)
    return
  }

  if (!prompt.trim()) {
    showToast('请输入提示词', 'error')
    return
  }

  let orderedInputImages = inputImages
  let maskImageId: string | null = null
  let maskTargetImageId: string | null = null

  if (maskDraft) {
    try {
      orderedInputImages = orderInputImagesForMask(inputImages, maskDraft.targetImageId)
      const coverage = await validateMaskMatchesImage(maskDraft.maskDataUrl, orderedInputImages[0].dataUrl)
      if (coverage === 'full' && !options.allowFullMask) {
        setConfirmDialog({
          title: '确认编辑整张图片？',
          message: '当前遮罩覆盖了整张图片，提交后可能会重绘全部内容。是否继续？',
          confirmText: '继续提交',
          tone: 'warning',
          action: () => {
            void submitTask({ allowFullMask: true })
          },
        })
        return
      }
      maskImageId = await storeImage(maskDraft.maskDataUrl, 'mask')
      cacheImage(maskImageId, maskDraft.maskDataUrl)
      maskTargetImageId = maskDraft.targetImageId
    } catch (err) {
      if (!inputImages.some((img) => img.id === maskDraft.targetImageId)) {
        useStore.getState().clearMaskDraft()
      }
      showToast(err instanceof Error ? err.message : String(err), 'error')
      return
    }
  }

  // 持久化输入图片到 IndexedDB（此前只在内存缓存中）
  for (const img of orderedInputImages) {
    await storeImage(img.dataUrl)
  }

  const normalizedParams = normalizeParamsForSettings(params, requestSettings, { hasInputImages: orderedInputImages.length > 0 })
  const normalizedParamPatch = getChangedParams(params, normalizedParams)
  if (Object.keys(normalizedParamPatch).length) {
    useStore.getState().setParams(normalizedParamPatch)
  }

  const taskId = genId()
  const task: TaskRecord = {
    id: taskId,
    asyncGeneration: { protocol: 'cctq-images-v1', credentialFingerprint: await credentialFingerprint(taskId, activeProfile.apiKey),
      slots: Array.from({ length: normalizedParams.n }, (_, index) => ({ index, phase: 'pending', results: [] })) },
    prompt: prompt.trim(),
    params: normalizedParams,
    apiProvider: activeProfile.provider,
    apiProfileId: activeProfile.id,
    apiProfileName: activeProfile.name,
    apiModel: activeProfile.model,
    inputImageIds: orderedInputImages.map((i) => i.id),
    maskTargetImageId,
    maskImageId,
    outputImages: [],
    status: 'running',
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
  }

  try { await putTask(task) } catch {
    showToast('本地任务保存失败，未发送生图请求。请检查浏览器存储空间。', 'error')
    return
  }
  const latestTasks = useStore.getState().tasks
  useStore.getState().setTasks([task, ...latestTasks])

  if (settings.clearInputAfterSubmit) {
    useStore.getState().setPrompt('')
    useStore.getState().clearInputImages()
  }
  useStore.getState().setReusedTaskApiProfile(null)

  // 异步调用 API
  executeTask(taskId)
}

async function executeTask(taskId: string) {
  const task = useStore.getState().tasks.find(t => t.id === taskId)
  if (!task?.asyncGeneration) return
  const profile = getTaskApiProfile(useStore.getState().settings, task)
  try {
    if (!profile) throw new Error('找不到原任务 API 配置，未发送请求')
    const inputImageDataUrls: string[] = []
    const ids = task.maskTargetImageId
      ? [task.maskTargetImageId, ...task.inputImageIds.filter(id => id !== task.maskTargetImageId)]
      : task.inputImageIds
    for (const id of ids) {
      const src = await ensureImageCached(id)
      if (!src) throw new Error('参考图不可读取，未发送生图请求')
      inputImageDataUrls.push(src)
    }
    const maskDataUrl = task.maskImageId ? await ensureImageCached(task.maskImageId) : undefined
    if (task.maskImageId && !maskDataUrl) throw new Error('遮罩不可读取，未发送生图请求')
    await asyncRuntime.run(taskId, { profile, opts: {
      settings: createSettingsForApiProfile(useStore.getState().settings, profile),
      prompt: replaceImageMentionsForApi(task.prompt), params: task.params, inputImageDataUrls, maskDataUrl: maskDataUrl || undefined,
    } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const updated = await commitAsyncTask(taskId, current => ({ ...current, status: 'error', error: message,
      asyncGeneration: { ...current.asyncGeneration!, slots: current.asyncGeneration!.slots.map(s => ({ ...s, phase: 'failed', error: message })) },
    })).catch(() => undefined)
    if (updated) receiveAsyncTask(updated)
    useStore.getState().showToast(message, 'error')
  }
}

export function updateTaskInStore(taskId: string, patch: Partial<TaskRecord>) {
  if (useStore.getState().tasks.some(t => t.id === taskId && isAsyncTask(t))) {
    void commitAsyncTask(taskId, current => ({ ...current, ...patch }))
      .then(task => { if (task) { receiveAsyncTask(task); asyncChanges?.postMessage({ id: taskId }) } })
      .catch(() => useStore.getState().showToast('任务更新保存失败', 'error'))
    return
  }
  const { tasks, setTasks } = useStore.getState()
  const updated = tasks.map((t) =>
    t.id === taskId ? { ...t, ...patch } : t,
  )
  setTasks(updated)
  const task = updated.find((t) => t.id === taskId)
  if (task) putTask(task)
}

function receiveAsyncTask(task: TaskRecord) {
  useStore.setState(state => ({ tasks: state.tasks.map(t => t.id === task.id ? task : t) }))
}

const asyncChanges = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('cctq-async-tasks') : null

const asyncRuntime = new AsyncImageRuntime({
  read: getTask, commit: commitAsyncTask, imageId: hashDataUrl, lock: browserTaskLock,
  profile: task => getTaskApiProfile(useStore.getState().settings, task) ?? undefined,
  changed: task => { receiveAsyncTask(task); asyncChanges?.postMessage({ id: task.id }) },
  saved: image => { cacheImage(image.id, image.dataUrl); scheduleThumbnailBackfill([image.id], 'visible') },
  notify: message => useStore.getState().showToast(message, 'error'),
})

if (asyncChanges) asyncChanges.onmessage = event => {
  const { id, deleted } = event.data ?? {}
  if (typeof id !== 'string') return
  if (deleted) {
    asyncRuntime.cancel(id)
    useStore.setState(state => ({ tasks: state.tasks.filter(t => t.id !== id), detailTaskId: state.detailTaskId === id ? null : state.detailTaskId }))
  } else if (!asyncRuntime.isRunning(id) && !asyncRuntime.hasRescue(id)) {
    void getTask(id).then(task => { if (task) receiveAsyncTask(task) }).catch(() => {})
  }
}

export async function resumeAsyncTask(taskId: string) {
  if (hasActiveDataOperations(useStore.getState().tasks.filter(t => t.id === taskId)) && asyncRuntime.isRunning(taskId)) return
  await asyncRuntime.run(taskId)
}

export async function downloadAsyncTaskResult(taskId: string, slotIndex: number, resultIndex: number) {
  const task = useStore.getState().tasks.find(t => t.id === taskId)
  const result = task?.asyncGeneration?.slots.find(s => s.index === slotIndex)?.results[resultIndex]
  if (!task || !result) throw new Error('图片结果已不存在')
  if (result.imageId && await ensureImageCached(result.imageId)) {
    const exported = await downloadImageIds([result.imageId], `task-${taskId}-${slotIndex + 1}-${resultIndex + 1}`)
    if (!exported.successCount) throw new Error('本地图片导出失败')
    return
  }
  const image = await asyncRuntime.download(taskId, slotIndex, resultIndex)
  const exported = await downloadImageIds([image.dataUrl], `task-${taskId}-${slotIndex + 1}-${resultIndex + 1}`)
  if (!exported.successCount) throw new Error('图片下载保存失败')
}

/** 重试失败的任务：创建新任务并执行 */
export async function retryTask(task: TaskRecord, confirmed = false) {
  if (isAsyncTask(task) && !confirmed) {
    useStore.getState().setConfirmDialog({ title: '重新生成并计费？',
      message: '这会创建新的生图任务。若只是查询或下载失败，请使用原任务的“查询状态”或“下载图片”。原任务可能仍在后台生成。',
      confirmText: '确认重新生成', action: () => { void retryTask(task, true) } })
    return
  }
  const { settings } = useStore.getState()
  const activeProfile = getActiveApiProfile(settings)
  const normalizedParams = normalizeParamsForSettings(task.params, settings, { hasInputImages: task.inputImageIds.length > 0 })
  const taskId = genId()
  const newTask: TaskRecord = {
    id: taskId,
    asyncGeneration: { protocol: 'cctq-images-v1', credentialFingerprint: await credentialFingerprint(taskId, activeProfile.apiKey),
      slots: Array.from({ length: normalizedParams.n }, (_, index) => ({ index, phase: 'pending', results: [] })) },
    prompt: task.prompt,
    params: normalizedParams,
    apiProvider: activeProfile.provider,
    apiProfileId: activeProfile.id,
    apiProfileName: activeProfile.name,
    apiModel: activeProfile.model,
    inputImageIds: [...task.inputImageIds],
    maskTargetImageId: task.maskTargetImageId ?? null,
    maskImageId: task.maskImageId ?? null,
    outputImages: [],
    status: 'running',
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
  }

  try { await putTask(newTask) } catch {
    useStore.getState().showToast('本地任务保存失败，未发送生图请求。', 'error')
    return
  }
  const latestTasks = useStore.getState().tasks
  useStore.getState().setTasks([newTask, ...latestTasks])

  executeTask(taskId)
}

/** 复用配置 */
export async function reuseConfig(task: TaskRecord) {
  const { settings, setPrompt, setParams, setInputImages, setMaskDraft, clearMaskDraft, showToast, setConfirmDialog, setReusedTaskApiProfile } = useStore.getState()
  const normalizedSettings = normalizeSettings(settings)
  const currentProfile = getActiveApiProfile(settings)
  const matchedProfile = normalizedSettings.reuseTaskApiProfileTemporarily ? getTaskApiProfile(normalizedSettings, task) : null
  const shouldTemporarilyReuseProfile = Boolean(matchedProfile && matchedProfile.id !== currentProfile.id)
  const missingReusedProfile = normalizedSettings.reuseTaskApiProfileTemporarily && !matchedProfile
  const taskProfileName = matchedProfile?.name ?? getTaskApiProfileName(task)
  const paramsSettings = shouldTemporarilyReuseProfile && matchedProfile ? createSettingsForApiProfile(normalizedSettings, matchedProfile) : normalizedSettings

  setPrompt(task.prompt)
  setParams(normalizeParamsForSettings(task.params, paramsSettings, { hasInputImages: task.inputImageIds.length > 0 }))
  setReusedTaskApiProfile(
    shouldTemporarilyReuseProfile && matchedProfile ? matchedProfile.id : null,
    missingReusedProfile,
    taskProfileName,
  )

  // 恢复输入图片
  const imgs: InputImage[] = []
  for (const imgId of task.inputImageIds) {
    const dataUrl = await ensureImageCached(imgId)
    if (dataUrl) {
      imgs.push({ id: imgId, dataUrl })
    }
  }
  setInputImages(imgs)
  const maskTargetImageId = task.maskTargetImageId ?? (task.maskImageId ? task.inputImageIds[0] : null)
  if (maskTargetImageId && task.maskImageId && imgs.some((img) => img.id === maskTargetImageId)) {
    const maskDataUrl = await ensureImageCached(task.maskImageId)
    if (maskDataUrl) {
      setMaskDraft({
        targetImageId: maskTargetImageId,
        maskDataUrl,
        updatedAt: Date.now(),
      })
    } else {
      clearMaskDraft()
    }
  } else {
    clearMaskDraft()
  }
  if (missingReusedProfile) {
    setConfirmDialog({
      title: '找不到 API 配置',
      message: `找不到复用任务所使用的 API 配置「${taskProfileName}」，要使用当前的 API 配置「${currentProfile.name}」提交任务吗？`,
      confirmText: '使用当前配置提交',
      cancelText: '放弃提交',
      action: () => {
        void submitTask({ useCurrentApiProfileWhenReusedMissing: true })
      },
    })
    return
  }

  showToast(
    shouldTemporarilyReuseProfile && matchedProfile
      ? `已临时复用该任务的 API 配置「${matchedProfile.name}」`
      : '已复用配置到输入框',
    'success',
  )
}

/** 编辑输出：将输出图加入输入 */
export async function editOutputs(task: TaskRecord) {
  const { inputImages, addInputImage, showToast } = useStore.getState()
  if (!task.outputImages?.length) return

  let added = 0
  for (const imgId of task.outputImages) {
    if (inputImages.find((i) => i.id === imgId)) continue
    const dataUrl = await ensureImageCached(imgId)
    if (dataUrl) {
      addInputImage({ id: imgId, dataUrl })
      added++
    }
  }
  showToast(`已添加 ${added} 张输出图到输入`, 'success')
}

function addTaskImageIds(target: Set<string>, task: TaskRecord) {
  for (const id of task.inputImageIds || []) target.add(id)
  if (task.maskImageId) target.add(task.maskImageId)
  for (const id of task.outputImages || []) target.add(id)
}

function isImageReferencedByState(state: AppState, imageId: string) {
  return state.inputImages.some((image) => image.id === imageId)
    || state.tasks.some((task) =>
      task.maskImageId === imageId
      || task.inputImageIds.includes(imageId)
      || task.outputImages.includes(imageId),
    )
}

async function deleteStoredImageIfUnreferenced(imageId: string): Promise<boolean> {
  if (isImageReferencedByState(useStore.getState(), imageId)) return false
  const [image, thumbnail] = await Promise.all([getImage(imageId), getStoredImageThumbnail(imageId)])
  if (isImageReferencedByState(useStore.getState(), imageId)) return false

  await deleteImage(imageId)
  if (!isImageReferencedByState(useStore.getState(), imageId)) {
    deleteImageCacheEntry(imageId)
    useStore.setState((state) => {
      const lightboxImageList = state.lightboxImageList.filter((id) => id !== imageId)
      return {
        lightboxImageList,
        lightboxImageId: state.lightboxImageId === imageId ? lightboxImageList[0] ?? null : state.lightboxImageId,
      }
    })
    return true
  }

  if (image) {
    await putImage(image)
    cacheImage(image.id, image.dataUrl)
  }
  if (thumbnail) {
    await putImageThumbnail(thumbnail)
    cacheThumbnail(thumbnail.id, {
      dataUrl: thumbnail.thumbnailDataUrl,
      width: thumbnail.width,
      height: thumbnail.height,
      thumbnailVersion: thumbnail.thumbnailVersion,
    })
  }
  return false
}

async function deleteUnreferencedImageIds(imageIds: Iterable<string>) {
  for (const imageId of new Set(imageIds)) await deleteStoredImageIfUnreferenced(imageId)
}

async function removeTasks(taskIds: string[]) {
  const toDelete = new Set(taskIds)
  let deletedTasks: TaskRecord[] = []

  useStore.setState((state) => {
    deletedTasks = state.tasks.filter((task) => toDelete.has(task.id))
    return {
      tasks: state.tasks.filter((task) => !toDelete.has(task.id)),
      selectedTaskIds: state.selectedTaskIds.filter((id) => !toDelete.has(id)),
      detailTaskId: state.detailTaskId && toDelete.has(state.detailTaskId) ? null : state.detailTaskId,
    }
  })
  if (!deletedTasks.length) return 0

  const imageIds = new Set<string>()
  for (const task of deletedTasks) {
    addTaskImageIds(imageIds, task)
    asyncRuntime.cancel(task.id)
    asyncChanges?.postMessage({ id: task.id, deleted: true })
  }

  try {
    await commitTaskDeletion(deletedTasks.map((task) => task.id))
  } catch (error) {
    console.warn('原子删除任务失败，改用逐项删除', error)
    await Promise.all(deletedTasks.map((task) => dbDeleteTask(task.id)))
  }
  await deleteUnreferencedImageIds(imageIds)
  return deletedTasks.length
}

/** 删除多条任务 */
export async function removeMultipleTasks(taskIds: string[]) {
  if (!taskIds.length) return
  const deletedCount = await removeTasks(taskIds)
  if (!deletedCount) return
  useStore.getState().showToast(`已删除 ${deletedCount} 条记录`, 'success')
}

/** 删除所有失败任务 */
export async function clearFailedTasks(taskIds?: string[]) {
  const targetTaskIds = taskIds ? new Set(taskIds) : null
  const failedTasks = useStore.getState().tasks
    .filter((task) => taskMatchesFilterStatus(task, 'error') && (!targetTaskIds || targetTaskIds.has(task.id)))
  const failedTaskIds = failedTasks
    .filter((task) => task.status === 'error')
    .map((task) => task.id)
  const partialFailedTaskIds = new Set(
    failedTasks
      .filter((task) => task.status !== 'error' && taskHasOutputErrors(task))
      .map((task) => task.id),
  )

  if (failedTaskIds.length) await removeMultipleTasks(failedTaskIds)
  if (partialFailedTaskIds.size) {
    const { tasks, setTasks, selectedTaskIds, setSelectedTaskIds, showToast } = useStore.getState()
    const updated = tasks.map((task) => partialFailedTaskIds.has(task.id) && !isAsyncTask(task) ? { ...task, outputErrors: undefined } : task)
    setTasks(updated)
    const nextSelectedTaskIds = selectedTaskIds.filter((id) => !partialFailedTaskIds.has(id))
    if (nextSelectedTaskIds.length !== selectedTaskIds.length) setSelectedTaskIds(nextSelectedTaskIds)
    await Promise.all(updated.filter((task) => partialFailedTaskIds.has(task.id)).map(async task => {
      if (!isAsyncTask(task)) { await putTask(task); return }
      // Read the latest record in the transaction; another slot/tab may have just saved an ID or image.
      const saved = await commitAsyncTask(task.id, current => summarizeAsyncTask({ ...current,
        dismissedAsyncErrorIndices: [...new Set([...(current.dismissedAsyncErrorIndices ?? []),
          ...current.asyncGeneration!.slots.filter(s => s.phase === 'failed').map(s => s.index)])],
      }))
      if (saved) { receiveAsyncTask(saved); asyncChanges?.postMessage({ id: saved.id }) }
    }))
    showToast(`已清除 ${partialFailedTaskIds.size} 条部分失败记录`, 'success')
  }
}

/** 删除单条任务 */
export async function removeTask(task: TaskRecord) {
  const deletedCount = await removeTasks([task.id])
  if (!deletedCount) return
  useStore.getState().showToast('记录已删除', 'success')
}

/** 清空数据选项 */
export interface ClearOptions {
  clearConfig?: boolean
  clearTasks?: boolean
}

/** 清空数据 */
export async function clearData(options: ClearOptions = { clearConfig: true, clearTasks: true }) {
  const { setTasks, clearInputImages, clearMaskDraft, setSettings, setParams, showToast } = useStore.getState()

  if (options.clearTasks) {
    asyncRuntime.cancelAll()
    for (const task of useStore.getState().tasks) asyncChanges?.postMessage({ id: task.id, deleted: true })
    await dbClearTasks()
    await clearImages()
    clearImageCaches()
    setTasks([])
    clearInputImages()
    clearMaskDraft()
  }

  if (options.clearConfig) {
    useStore.setState({ dismissedCodexCliPrompts: [] })
    setSettings({ ...DEFAULT_SETTINGS })
    setParams({ ...DEFAULT_PARAMS })
  }

  showToast('所选数据已清空', 'success')
}

/** 导出选项 */
export interface ExportOptions {
  exportConfig?: boolean
  exportTasks?: boolean
}

/** 导出数据为 ZIP */
export async function exportData(options: ExportOptions = { exportConfig: true, exportTasks: true }) {
  try {
    const state = useStore.getState()
    if (options.exportTasks && hasActiveDataOperations(state.tasks)) {
      throw new Error('当前有任务正在进行，请完成或停止后再导出。')
    }
    const tasks = options.exportTasks ? await getAllTasks() : []
    const images = options.exportTasks ? await getAllImages() : []
    const { settings } = state
    const exportedAt = Date.now()
    const thumbnailsByImageId = new Map<string, StoredImageThumbnail>()
    const imageSizes = []
    for (const image of images) {
      const thumbnail = await getImageThumbnail(image.id)
      if (thumbnail?.thumbnailDataUrl) {
        thumbnailsByImageId.set(image.id, thumbnail)
        cacheThumbnail(image.id, {
          dataUrl: thumbnail.thumbnailDataUrl,
          width: thumbnail.width,
          height: thumbnail.height,
          thumbnailVersion: thumbnail.thumbnailVersion,
        })
      }
      imageSizes.push({ id: image.id, bytes: getExportImageEstimatedBytes(image, thumbnail) })
    }

    const params = { options, exportedAt, settings, tasks, imageTasks: tasks }
    const plan = getExportZipPlan(params, imageSizes)
    const imagesById = new Map(images.map((image) => [image.id, image]))
    const backupId = String(exportedAt)

    for (let index = 0; index < plan.length; index++) {
      const part = plan[index]
      const partImages = part.imageIds.flatMap((id) => {
        const image = imagesById.get(id)
        return image ? [image] : []
      })
      const partThumbnails = new Map<string, StoredImageThumbnail>()
      for (const id of part.imageIds) {
        const thumbnail = thumbnailsByImageId.get(id)
        if (thumbnail) partThumbnails.set(id, thumbnail)
      }

      const partNumber = index + 1
      const result = await buildExportZip({
        ...params,
        tasks: part.tasks,
        images: partImages,
        thumbnailsByImageId: partThumbnails,
        includeManifestData: part.includeBaseData,
        backupPart: plan.length > 1 ? { id: backupId, index: partNumber, total: plan.length } : undefined,
      })
      const blob = createExportBlob(result.bytes)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const suffix = plan.length > 1
        ? `_${String(plan.length).padStart(2, '0')}parts_part${String(partNumber).padStart(2, '0')}`
        : ''
      link.href = url
      link.download = `cctq-image-${formatExportFileTime(new Date(exportedAt))}${suffix}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      if (partNumber < plan.length) await new Promise((resolve) => window.setTimeout(resolve, 150))
    }
    useStore.getState().showToast(
      plan.length > 1 ? `已请求下载 ${plan.length} 个 ZIP，请确认浏览器已允许多文件下载` : '数据已导出',
      'success',
    )
  } catch (e) {
    console.error('exportData failed', e)
    const detail = e instanceof Error ? e.message.trim() : String(e).trim()
    useStore.getState().showToast(detail ? `导出失败，${detail}` : '导出失败，未知错误', 'error')
  }
}

/** 导入选项 */
export interface ImportOptions {
  importConfig?: boolean
  importTasks?: boolean
}

/** 导入 ZIP 数据 */
export async function importData(input: File | File[], options: ImportOptions = { importConfig: true, importTasks: true }): Promise<boolean> {
  try {
    const state = useStore.getState()
    if (options.importTasks && hasActiveDataOperations(state.tasks)) {
      throw new Error('当前有任务正在进行，请完成或停止后再导入。')
    }
    const files = Array.isArray(input) ? input : [input]
    if (!files.length) throw new Error('没有选择备份文件。')
    if (files.some((file) => file.size >= MAX_EXPORT_ZIP_BYTES)) {
      throw new Error('单个 ZIP 不能达到或超过 2 GB，请选择分片备份。')
    }

    const selected: Array<{ file: File; manifest: Awaited<ReturnType<typeof readExportZipManifest>> }> = []
    for (const file of files) {
      const manifest = await readExportZipManifest(new Uint8Array(await file.arrayBuffer()), options.importTasks)
      selected.push({ file, manifest })
    }

    const multipart = selected.some((part) => part.manifest.backupPart != null)
    if (multipart) {
      if (selected.some((part) => !part.manifest.backupPart)) {
        throw new Error('不能混合选择分片备份和普通备份。')
      }
      const first = selected[0].manifest.backupPart!
      const indexes = new Set(selected.map((part) => part.manifest.backupPart!.index))
      const validSet = selected.every((part) => {
        const backupPart = part.manifest.backupPart!
        return backupPart.id === first.id
          && backupPart.total === first.total
          && backupPart.index >= 1
          && backupPart.index <= first.total
      })
      if (!validSet || indexes.size !== selected.length) {
        throw new Error('所选分片不属于同一批备份或包含重复分片。')
      }
      if (options.importTasks && (selected.length !== first.total || indexes.size !== first.total)) {
        throw new Error(`分片备份不完整，请一次选择同一备份的全部 ${first.total} 个 ZIP。`)
      }
      selected.sort((left, right) => left.manifest.backupPart!.index - right.manifest.backupPart!.index)
    }

    const settingsManifests = selected.filter((part) => part.manifest.settings)
    if (options.importConfig && !options.importTasks && !settingsManifests.length) {
      throw new Error('所选备份不包含配置数据。')
    }
    const importedTasks = selected.flatMap((part) => part.manifest.tasks ?? [])
    const hasTaskData = selected.some((part) => part.manifest.tasks != null || part.manifest.imageFiles != null)

    const importedImageIds: string[] = []
    if (options.importTasks && hasTaskData) {
      for (const part of selected) {
        const { manifest, files: zipFiles } = await readExportZip(new Uint8Array(await part.file.arrayBuffer()))
        for (const [id, info] of Object.entries(manifest.imageFiles ?? {})) {
          const dataUrl = readExportZipFileAsDataUrl(zipFiles, info.path)
          if (!dataUrl) continue
          await putImage({
            id,
            dataUrl,
            createdAt: info.createdAt,
            source: info.source,
            width: info.width,
            height: info.height,
          })
          cacheImage(id, dataUrl)
          importedImageIds.push(id)
        }

        for (const [id, info] of Object.entries(manifest.thumbnailFiles ?? {})) {
          const thumbnailDataUrl = readExportZipFileAsDataUrl(zipFiles, info.path)
          if (!thumbnailDataUrl) continue
          await putImageThumbnail({
            id,
            thumbnailDataUrl,
            width: info.width,
            height: info.height,
            thumbnailVersion: info.thumbnailVersion,
          })
          cacheThumbnail(id, {
            dataUrl: thumbnailDataUrl,
            width: info.width,
            height: info.height,
            thumbnailVersion: info.thumbnailVersion,
          })
        }
      }

      for (const task of importedTasks) {
        await putTask(isAsyncTask(task) ? pauseAsyncTask(task) : task)
      }

      const tasks = await getAllTasks()
      useStore.getState().setTasks(tasks)
      scheduleThumbnailBackfill(importedImageIds)
    }

    if (options.importConfig && settingsManifests.length) {
      const state = useStore.getState()
      const settings = settingsManifests.reduce(
        (current, part) => mergeImportedSettings(current, part.manifest.settings),
        state.settings,
      )
      state.setSettings(settings)
    }

    let msg = '数据已成功导入'
    if (options.importTasks && hasTaskData) {
      msg = `已导入 ${importedTasks.length} 条记录`
    } else if (options.importConfig && settingsManifests.length) {
      msg = '配置已成功导入'
    }

    useStore.getState().showToast(msg, 'success')
    return true
  } catch (e) {
    console.error('importData failed', e)
    const detail = e instanceof Error ? e.message.trim() : String(e).trim()
    useStore.getState().showToast(detail ? `导入失败，${detail}` : '导入失败，未知错误', 'error')
    return false
  }
}

/** 添加图片到输入（文件上传） */
export async function createInputImageFromFile(file: File): Promise<InputImage | null> {
  if (!file.type.startsWith('image/')) return null
  const dataUrl = await fileToDataUrl(file)
  const id = await storeImage(dataUrl, 'upload')
  cacheImage(id, dataUrl)
  return { id, dataUrl }
}

export async function deleteImageIfUnreferenced(imageId: string): Promise<boolean> {
  return deleteStoredImageIfUnreferenced(imageId)
}

export async function addImageFromFile(file: File): Promise<void> {
  const image = await createInputImageFromFile(file)
  if (image) useStore.getState().addInputImage(image)
}

/** 添加图片到输入（右键菜单）—— 支持 data/blob/http URL */
export async function addImageFromUrl(src: string): Promise<void> {
  const res = await fetch(src)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) throw new Error('不是有效的图片')
  const dataUrl = await blobToDataUrl(blob)
  const id = await storeImage(dataUrl, 'upload')
  cacheImage(id, dataUrl)
  useStore.getState().addInputImage({ id, dataUrl })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
