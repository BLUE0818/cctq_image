import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ZipDownloadRoute } from '../../types'
import { CloseIcon } from '../icons'

export const ZIP_DOWNLOAD_ROUTE_OPTIONS: Array<{ route: ZipDownloadRoute; label: string; description: string }> = [
  { route: 'task-selection', label: '任务列表 > 多选', description: '选中多个任务后，将输出图片下载为一个 ZIP。' },
  { route: 'task-detail-all', label: '任务详情 > 下载全部', description: '任务详情弹窗中下载当前任务的所有输出图时使用 ZIP。' },
]

interface ZipDownloadRouteModalProps {
  routes: ZipDownloadRoute[]
  scrollBoundaryRef: RefObject<HTMLDivElement | null>
  onSetEnabled: (route: ZipDownloadRoute, enabled: boolean) => void
  onClose: () => void
}

export default function ZipDownloadRouteModal({
  routes,
  scrollBoundaryRef,
  onSetEnabled,
  onClose,
}: ZipDownloadRouteModalProps) {
  return createPortal(
    <div
      data-no-drag-select
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-md animate-overlay-in" />
      <div
        className="relative z-10 w-full max-w-md rounded-3xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border border-white/50 dark:border-white/[0.08] shadow-[0_8px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] ring-1 ring-black/5 dark:ring-white/10 animate-confirm-in flex flex-col max-h-[85vh] sm:max-h-[90vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 p-6 pb-2">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">使用压缩包进行批量下载</h3>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              aria-label="关闭"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <div data-selectable-text className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            开启后，对应批量下载会生成一个 ZIP，而不是逐个下载图片文件。
          </div>
        </div>

        <div ref={scrollBoundaryRef} className="flex-1 overflow-y-auto px-6 space-y-3 custom-scrollbar min-h-0 py-2">
          {ZIP_DOWNLOAD_ROUTE_OPTIONS.map((option) => {
            const isChecked = routes.includes(option.route)
            return (
              <button
                key={option.route}
                type="button"
                onClick={() => onSetEnabled(option.route, !isChecked)}
                className={`w-full rounded-2xl border p-3.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                  isChecked
                    ? 'border-blue-500/30 bg-blue-50/50 dark:border-blue-400/30 dark:bg-blue-500/[0.05]'
                    : 'border-gray-100 bg-gray-50/70 hover:bg-gray-100/70 dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]'
                }`}
                aria-pressed={isChecked}
              >
                <span className="flex items-center gap-2">
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                    isChecked ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 dark:border-white/20'
                  }`}>
                    {isChecked && (
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{option.label}</span>
                </span>
                <span data-selectable-text className="mt-1.5 block pl-6 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {option.description}
                </span>
              </button>
            )
          })}
        </div>

        <div className="shrink-0 p-6 pt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-blue-500 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
          >
            完成
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
