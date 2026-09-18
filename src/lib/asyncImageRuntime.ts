import type { ApiProfile, AsyncImageSlot, StoredImage, TaskRecord } from '../types'
import { ASYNC_POLL_MS, pauseAsyncTask, summarizeAsyncTask } from './asyncTaskState'
import { credentialFingerprint, downloadAsyncImage, prepareAsyncImageRequest, queryAsyncImage, SubmissionError, submitAsyncImage } from './asyncImageApi'
import type { CallApiOptions } from './imageApiShared'
import { getApiErrorResponseSnapshot } from './imageApiShared'

export interface AsyncRuntimeDeps {
  read(id: string): Promise<TaskRecord | undefined>
  commit(id: string, change: (task: TaskRecord) => TaskRecord, image?: StoredImage): Promise<TaskRecord | undefined>
  profile(task: TaskRecord): ApiProfile | undefined
  changed(task: TaskRecord): void
  saved(image: StoredImage): void
  imageId(dataUrl: string): Promise<string>
  lock<T>(id: string, action: () => Promise<T>): Promise<T | undefined>
  notify(message: string): void
}
interface Run { task: TaskRecord; controller: AbortController; tail: Promise<unknown>; storageFailed: boolean }

export async function browserTaskLock<T>(id: string, action: () => Promise<T>): Promise<T | undefined> {
  if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('当前浏览器不支持安全任务锁，请使用新版浏览器的 HTTPS 或 localhost 页面')
  return navigator.locks.request(`cctq-async:${id}`, { ifAvailable: true }, lock => lock ? action() : undefined)
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('已停止本地处理')); return }
    const abort = () => { clearTimeout(timer); reject(new Error('已停止本地处理')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export class AsyncImageRuntime {
  private running = new Map<string, Promise<void>>()
  private controllers = new Map<string, AbortController>()
  // ID acknowledged but IndexedDB failed: retain it in memory for copy/retry, never POST again.
  private rescue = new Map<string, TaskRecord>()
  constructor(private deps: AsyncRuntimeDeps) {}
  isRunning(id: string) { return this.running.has(id) }
  cancel(id: string) { this.controllers.get(id)?.abort(); this.rescue.delete(id) }
  cancelAll() { for (const id of this.controllers.keys()) this.cancel(id) }
  hasRescue(id: string) { return this.rescue.has(id) }

  private async boundProfile(task: TaskRecord) {
    const profile = this.deps.profile(task)
    if (!profile?.apiKey) throw new Error('找不到原任务的 API 配置或 Key，请恢复原配置后继续查询')
    if (await credentialFingerprint(task.id, profile.apiKey) !== task.asyncGeneration?.credentialFingerprint) {
      throw new Error('原任务的 Key 已更换，请恢复提交时的 Key；不会使用当前其他 Key 或重新生成')
    }
    return { ...profile, apiKey: profile.apiKey.trim() }
  }

  /** All slot commits are serialized; late results cannot recreate a deleted task. */
  private update(run: Run, change: (task: TaskRecord) => TaskRecord, image?: StoredImage): Promise<void> {
    const op = run.tail.catch(() => {}).then(async () => {
      if (run.controller.signal.aborted) throw new Error('已停止本地处理')
      const previous = run.task
      let next = summarizeAsyncTask(change(run.task))
      run.task = next
      if (run.storageFailed) { this.rescue.set(next.id, next); this.deps.changed(next); throw new Error('本地保存失败，任务 ID 仅在当前页面，请先复制 ID，勿刷新') }
      try {
        const saved = await this.deps.commit(next.id, current => summarizeAsyncTask({
          ...current, asyncGeneration: next.asyncGeneration,
        }), image)
        if (!saved) { run.controller.abort(); return }
        run.task = saved
        if (!run.controller.signal.aborted) this.deps.changed(saved)
        if (image && !run.controller.signal.aborted) this.deps.saved(image)
      } catch (error) {
        if (image && !previous.outputImages.includes(image.id)) {
          next = summarizeAsyncTask({ ...next, asyncGeneration: { ...next.asyncGeneration!, slots: next.asyncGeneration!.slots.map(s => ({
            ...s, results: s.results.map(r => r.imageId === image.id ? { ...r, imageId: undefined } : r),
          })) } })
          run.task = next
        }
        run.storageFailed = true
        this.rescue.set(next.id, next)
        this.deps.changed(next)
        throw error
      }
    })
    run.tail = op
    return op
  }

  private slot(run: Run, index: number, patch: Partial<AsyncImageSlot>) {
    return this.update(run, task => ({ ...task, asyncGeneration: { ...task.asyncGeneration!,
      slots: task.asyncGeneration!.slots.map(s => s.index === index ? { ...s, ...patch } : s),
    } }))
  }

  run(id: string, initial?: { opts: CallApiOptions; profile: ApiProfile }): Promise<void> {
    const existing = this.running.get(id)
    if (existing) return existing
    const operation = this.runLocked(id, initial).catch(async error => {
      const message = error instanceof Error ? error.message : String(error)
      if (!this.controllers.get(id)?.signal.aborted) {
        const task = await this.deps.commit(id, current => summarizeAsyncTask({ ...current, asyncGeneration: { ...current.asyncGeneration!,
          slots: current.asyncGeneration!.slots.map(s => ['saved', 'failed', 'unknown'].includes(s.phase) ? s : {
            ...s, phase: s.remoteId ? 'paused' : s.phase === 'pending' ? 'failed' : 'unknown', error: message,
          }),
        } })).catch(() => undefined)
        if (task) this.deps.changed(task)
        this.deps.notify(message)
      }
    })
      .finally(() => { this.running.delete(id); this.controllers.delete(id) })
    this.running.set(id, operation)
    return operation
  }

  private async runLocked(id: string, initial?: { opts: CallApiOptions; profile: ApiProfile }) {
    const controller = new AbortController()
    this.controllers.set(id, controller)
    const result = await this.deps.lock(id, async () => {
      const persisted = await this.deps.read(id)
      if (!persisted?.asyncGeneration || controller.signal.aborted) return true
      const rescued = this.rescue.get(id)
      const run: Run = { task: rescued ?? (initial ? persisted : pauseAsyncTask(persisted)), controller, tail: Promise.resolve(), storageFailed: false }
      let profile: ApiProfile
      let request: Awaited<ReturnType<typeof prepareAsyncImageRequest>> | undefined
      try {
        profile = await this.boundProfile(run.task)
        request = initial ? await prepareAsyncImageRequest(initial.opts, profile) : undefined
      } catch (error) {
        await this.update(run, task => ({ ...task, asyncGeneration: { ...task.asyncGeneration!, slots: task.asyncGeneration!.slots.map(s => ['saved', 'failed', 'unknown'].includes(s.phase) ? s : {
          ...s, phase: s.remoteId ? 'paused' : 'failed', error: error instanceof Error ? error.message : String(error),
        }) } }))
        return true
      }
      // Snapshot the profile; switching the current selected config cannot change credentials mid-run.
      const selected = run.task.asyncGeneration!.slots.filter(s => initial ? s.phase === 'pending' :
        Boolean(s.remoteId && !['failed', 'saved'].includes(s.phase))).map(s => s.index)
      if (!selected.length) return true
      if (rescued) { await this.update(run, task => task); this.rescue.delete(id) }
      await Promise.allSettled(selected.map(index => this.processSlot(run, index, profile, request)))
      if (controller.signal.aborted) return true
      if (run.storageFailed) {
        const paused = pauseAsyncTask(run.task)
        paused.asyncGeneration!.slots = paused.asyncGeneration!.slots.map(s => ['saved', 'failed'].includes(s.phase) ? s : {
          ...s, error: '本地保存失败。远端 ID 仅在当前页面，请先复制 ID；修复浏览器存储后点查询状态，勿刷新。',
        })
        this.rescue.set(id, paused); this.deps.changed(paused)
        this.deps.notify('本地存储失败，已暂停；请先复制任务 ID，勿刷新页面。')
      }
      return true
    })
    if (result === undefined) this.deps.notify('此任务正在另一个标签页处理，请到该页面查看；没有重复查询或提交。')
  }

  private async processSlot(run: Run, index: number, profile: ApiProfile, request?: Awaited<ReturnType<typeof prepareAsyncImageRequest>>) {
    const current = () => run.task.asyncGeneration!.slots.find(s => s.index === index)!
    const signal = run.controller.signal
    try {
      if (request) {
        await this.slot(run, index, { phase: 'submitting', error: undefined, errorResponse: undefined })
        if (signal.aborted || run.storageFailed) return
        const accepted = await submitAsyncImage(request, profile.apiKey, signal)
        // No polling before the accepted ID transaction commits.
        await this.slot(run, index, { remoteId: accepted.id, remoteStatus: accepted.status, phase: 'polling' })
        await wait(ASYNC_POLL_MS, signal)
      } else {
        await this.slot(run, index, { phase: current().remoteStatus === 'completed' ? 'downloading' : 'polling', error: undefined, errorResponse: undefined })
      }
      while (!signal.aborted && !run.storageFailed) {
        const slot = current()
        if (!slot.remoteId) return
        if (slot.remoteStatus !== 'completed' || !slot.results.length) {
          const reply = await queryAsyncImage(slot.remoteId, profile.apiKey, signal)
          const results = reply.results.map(r => ({ ...r, imageId: slot.results.find(old => old.url === r.url)?.imageId }))
          await this.slot(run, index, { remoteStatus: reply.status, lastCheckedAt: Date.now(), expiresAt: reply.expiresAt,
            ...(reply.status === 'completed' ? { results } : {}),
            phase: reply.status === 'failed' ? 'failed' : reply.status === 'completed' ? 'downloading' : 'polling',
            error: reply.error ? this.redact(reply.error, profile.apiKey) : undefined, errorResponse: this.safeSnapshot(reply.errorResponse, profile.apiKey),
          })
          if (reply.status === 'failed') return
          if (reply.status !== 'completed') { await wait(ASYNC_POLL_MS, signal); continue }
        }
        for (let r = 0; r < current().results.length; r++) {
          if (current().results[r].imageId) continue
          if (signal.aborted || run.storageFailed) return
          await this.slot(run, index, { phase: 'downloading' })
          const received = await downloadAsyncImage(current().remoteId!, current().results[r].url, profile.apiKey, signal)
          await this.slot(run, index, { phase: 'saving' })
          const image: StoredImage = { id: await this.deps.imageId(received.dataUrl), dataUrl: received.dataUrl,
            createdAt: Date.now(), source: 'generated', width: received.width, height: received.height }
          await this.update(run, task => ({ ...task, asyncGeneration: { ...task.asyncGeneration!, slots: task.asyncGeneration!.slots.map(s => s.index !== index ? s : {
            ...s, results: s.results.map((item, i) => i !== r ? item : { ...item, imageId: image.id,
              actualParams: { ...item.actualParams, size: `${received.width}x${received.height}`, output_format: received.format, n: 1 } }),
          }) } }), image)
        }
        await this.slot(run, index, { phase: 'saved', error: undefined, errorResponse: undefined })
        return
      }
    } catch (error) {
      if (signal.aborted || run.storageFailed) return
      const message = this.redact(error instanceof Error ? error.message : String(error), profile.apiKey)
      const phase = error instanceof SubmissionError ? (error.uncertain ? 'unknown' : 'failed') : current().remoteId ? 'paused' : 'failed'
      await this.slot(run, index, { phase, error: message,
        errorResponse: this.safeSnapshot(getApiErrorResponseSnapshot(error instanceof SubmissionError ? error.original : error), profile.apiKey) })
    }
  }

  private redact(value: string, key: string) { return value.split(key).join('[REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]') }
  private safeSnapshot(value: AsyncImageSlot['errorResponse'], key: string) {
    return value ? JSON.parse(this.redact(JSON.stringify(value), key)) as AsyncImageSlot['errorResponse'] : undefined
  }

  /** Explicit manual download, never a generation request. Storage failure need not prevent file export. */
  async download(id: string, index: number, resultIndex: number) {
    if (this.running.has(id)) throw new Error('该任务正在处理，请等待当前处理结束后下载')
    const downloaded = await this.deps.lock(id, async () => {
      const task = this.rescue.get(id) ?? await this.deps.read(id)
      if (!task) throw new Error('任务已删除')
      const profile = await this.boundProfile(task)
      const slot = task.asyncGeneration?.slots.find(s => s.index === index)
      const result = slot?.results[resultIndex]
      if (!slot?.remoteId || !result) throw new Error('尚未获得图片地址')
      return downloadAsyncImage(slot.remoteId, result.url, profile.apiKey, new AbortController().signal)
    })
    if (!downloaded) throw new Error('此任务正在其他标签页处理，请稍后再试')
    return downloaded
  }
}
