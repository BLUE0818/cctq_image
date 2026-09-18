import type { AsyncImageSlot, TaskRecord } from '../types'

export const ASYNC_POLL_MS = 5000
const activePhases = new Set(['pending', 'submitting', 'polling', 'downloading', 'saving'])

export function isAsyncTask(task: TaskRecord) {
  return task.asyncGeneration?.protocol === 'cctq-images-v1'
}

export function asyncSlotLabel(slot: AsyncImageSlot): string {
  switch (slot.phase) {
    case 'pending': return '等待提交'
    case 'submitting': return '提交中'
    case 'polling': return slot.remoteStatus === 'queued' ? '排队中' : '生成中'
    case 'downloading': return '已生成，下载中'
    case 'saving': return '保存中'
    case 'saved': return '已完成'
    case 'failed': return slot.remoteStatus === 'failed' ? '生成失败' : '提交失败'
    case 'unknown': return '提交结果未知'
    case 'paused': return slot.remoteStatus === 'completed' ? '等待下载 / 保存' : '等待查询'
  }
}

/** Keep remote completion separate from durable local completion. */
export function summarizeAsyncTask(task: TaskRecord, now = Date.now()): TaskRecord {
  const slots = task.asyncGeneration?.slots
  if (!slots?.length) return task
  const outputImages = [...new Set(slots.flatMap(s => s.results.flatMap(r => r.imageId ? [r.imageId] : [])))]
  const active = slots.some(s => activePhases.has(s.phase))
  const paused = slots.some(s => s.phase === 'paused' || s.phase === 'unknown')
  const terminal = !active && !paused
  const status = active ? 'running' : paused ? 'paused' : outputImages.length ? 'done' : 'error'
  const failures = slots.filter(s => s.phase === 'failed')
  const actualParamsByImage = { ...task.actualParamsByImage }
  const revisedPromptByImage = { ...task.revisedPromptByImage }
  for (const slot of slots) for (const result of slot.results) {
    if (result.imageId && result.actualParams) actualParamsByImage[result.imageId] = result.actualParams
    if (result.imageId && result.revisedPrompt) revisedPromptByImage[result.imageId] = result.revisedPrompt
  }
  return {
    ...task, status, outputImages, actualParamsByImage, revisedPromptByImage,
    actualParams: { ...task.actualParams, n: outputImages.length },
    outputErrors: failures.map(s => ({ requestIndex: s.index, error: s.error || '生成失败', response: s.errorResponse })),
    error: status === 'error' ? failures[0]?.error || '生成失败' : null,
    errorResponse: status === 'error' ? failures[0]?.errorResponse : undefined,
    finishedAt: terminal ? task.finishedAt ?? now : null,
    elapsed: terminal ? Math.max(0, (task.finishedAt ?? now) - task.createdAt) : null,
  }
}

/** Refresh/import never resubmits or starts a polling loop. */
export function pauseAsyncTask(task: TaskRecord): TaskRecord {
  if (!isAsyncTask(task)) return task
  return summarizeAsyncTask({ ...task, asyncGeneration: {
    ...task.asyncGeneration!,
    slots: task.asyncGeneration!.slots.map(slot => {
      if (!activePhases.has(slot.phase)) return slot
      if (slot.remoteId) return { ...slot, phase: 'paused', error: undefined }
      return { ...slot, phase: 'unknown', error: slot.phase === 'pending'
        ? '此项未提交；不会自动补发。需要时请手动创建新任务。'
        : '提交结果未知，请先到 CCTQ 生图记录确认，避免重复计费。' }
    }),
  } })
}

export function canResumeSlot(slot: AsyncImageSlot) {
  return Boolean(slot.remoteId && slot.phase === 'paused')
}

export function asyncTaskLabel(task: TaskRecord) {
  const slots = task.asyncGeneration?.slots ?? []
  const completed = slots.filter(s => s.phase === 'saved').length
  if (task.status === 'done') return slots.some(s => s.phase === 'failed') ? '部分完成' : '已完成'
  if (task.status === 'paused') return '等待手动继续'
  if (task.status === 'error') return '失败'
  const labels = [...new Set(slots.filter(s => activePhases.has(s.phase)).map(asyncSlotLabel))]
  return `${labels.join(' / ')}${slots.length > 1 ? ` · 已完成 ${completed}/${slots.length}` : ''}`
}
