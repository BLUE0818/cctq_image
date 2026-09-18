import { useState } from 'react'
import type { TaskRecord } from '../types'
import { resumeAsyncTask, downloadAsyncTaskResult, useStore } from '../store'
import { asyncSlotLabel, asyncTaskLabel, canResumeSlot, visibleAsyncSlots } from '../lib/asyncTaskState'
import { trustedResultUrl } from '../lib/asyncImageApi'
import { copyTextToClipboard } from '../lib/clipboard'

/** Shared by cards and details: never exposes a key or offers paid retries as recovery. */
export default function AsyncTaskPanel({ task }: { task: TaskRecord }) {
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const toast = useStore(s => s.showToast)
  const meta = task.asyncGeneration
  if (!meta) return null
  const slots = visibleAsyncSlots(task)
  const active = task.status === 'running'
  const resumable = slots.some(canResumeSlot)
  const fail = (error: unknown) => toast(error instanceof Error ? error.message : String(error), 'error')
  const copy = (text: string) => { void copyTextToClipboard(text).then(() => toast('已复制', 'success')).catch(fail) }
  const download = async (slot: number, result: number) => {
    const key = `${slot}:${result}`
    setDownloading(key)
    try { await downloadAsyncTaskResult(task.id, slot, result) } catch (error) { fail(error) }
    finally { setDownloading(null) }
  }
  return (
    <section data-no-drag-select className="border-t border-gray-100 dark:border-white/10 p-3 text-xs space-y-2 cursor-default"
      aria-label="异步任务状态" onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-gray-700 dark:text-gray-200">{asyncTaskLabel(task)}</span>
        {resumable && <button type="button" disabled={busy || active}
          className="rounded-lg px-3 py-2 text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-300 disabled:opacity-40"
          onClick={async () => { setBusy(true); try { await resumeAsyncTask(task.id) } catch (error) { fail(error) } finally { setBusy(false) } }}>
          {busy ? '正在处理' : '查询状态'}
        </button>}
      </div>
      {slots.map(slot => (
        <div key={slot.index} className="rounded-lg bg-gray-50 dark:bg-white/[0.03] p-2 space-y-1">
          <div className="flex flex-wrap justify-between gap-1 text-gray-600 dark:text-gray-300">
            <span>第 {slot.index + 1} 张 · {asyncSlotLabel(slot)}</span>
            {slot.lastCheckedAt && <span className="text-gray-400">上次查询 {new Date(slot.lastCheckedAt).toLocaleTimeString()}</span>}
          </div>
          {slot.remoteId && <div className="flex items-center gap-2 min-w-0">
            <span className="truncate select-text font-mono text-gray-500" title={slot.remoteId}>ID: {slot.remoteId}</span>
            <button className="shrink-0 px-2 py-1 text-blue-500" onClick={() => copy(slot.remoteId!)}>复制 ID</button>
          </div>}
          {slot.phase === 'paused' && slot.remoteStatus && <p className="text-gray-400">上次服务端状态：{slot.remoteStatus}</p>}
          {slot.error && <p className="whitespace-pre-wrap break-words text-amber-700 dark:text-amber-300">{slot.error}</p>}
          {slot.errorResponse && <details className="text-gray-500"><summary className="cursor-pointer">上游错误详情</summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all select-text">{JSON.stringify(slot.errorResponse, null, 2)}</pre>
          </details>}
          {slot.results.map((result, index) => {
            let url = ''
            try { url = trustedResultUrl(slot.remoteId!, result.url) } catch { /* untrusted imported link: never click/fetch */ }
            const enabled = Boolean(url)
            const key = `${slot.index}:${index}`
            return <div key={index} className="pt-1 space-y-1">
              <div className="text-gray-500">图片下载链接{slot.results.length > 1 ? ` ${index + 1}` : ''}</div>
              {enabled ? <a href={url} title={url} className="block truncate text-blue-500 underline"
                onClick={e => { e.preventDefault(); if (!downloading) void download(slot.index, index) }}>{url}</a>
                : <span className="text-red-500">返回的图片地址不可信，已阻止访问</span>}
              <div className="flex flex-wrap gap-2">
                <button className="rounded px-2 py-1.5 text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-300 disabled:opacity-40"
                  disabled={!enabled || downloading !== null || (active && !result.imageId)} onClick={() => void download(slot.index, index)}>
                  {downloading === key ? '下载中' : result.imageId ? '下载已保存图片' : '下载图片'}
                </button>
                <button className="px-2 py-1.5 text-blue-500 disabled:opacity-40" disabled={!enabled} onClick={() => copy(url)}>复制链接</button>
              </div>
            </div>
          })}
          {slot.expiresAt && <p className="text-gray-400">远端链接有效期至 {new Date(slot.expiresAt * 1000).toLocaleString()}</p>}
        </div>
      ))}
      {slots.some(s => s.results.length > 0) && <p className="text-gray-400">链接需要原任务 Key；点击由本页鉴权下载，复制链接不包含 Key。网络故障时仍可前往 CCTQ 生图记录找回。</p>}
      {task.status !== 'done' && <p className="text-gray-400">删除本地记录只停止本页查询，不取消后台生成或计费。</p>}
    </section>
  )
}
