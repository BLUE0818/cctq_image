import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import ViewportTooltip from '../ViewportTooltip'
import { CloseIcon } from '../icons'

interface CustomProviderModalProps {
  editing: boolean
  json: string
  error: string | null
  scrollBoundaryRef: RefObject<HTMLDivElement | null>
  onClose: () => void
  onCopyLlmPrompt: () => void
  onImportJson: () => void
  onJsonChange: (json: string) => void
  onSave: () => void
}

export default function CustomProviderModal({
  editing,
  json,
  error,
  scrollBoundaryRef,
  onClose,
  onCopyLlmPrompt,
  onImportJson,
  onJsonChange,
  onSave,
}: CustomProviderModalProps) {
  const llmPromptTooltipTimerRef = useRef<number | null>(null)
  const [llmPromptTooltipVisible, setLlmPromptTooltipVisible] = useState(false)

  const clearLlmPromptTooltipTimer = () => {
    if (llmPromptTooltipTimerRef.current == null) return
    window.clearTimeout(llmPromptTooltipTimerRef.current)
    llmPromptTooltipTimerRef.current = null
  }

  useEffect(() => () => clearLlmPromptTooltipTimer(), [])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" onClick={onClose} />
      <div ref={scrollBoundaryRef} className="relative z-10 w-full max-w-lg rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 overflow-y-auto overscroll-contain max-h-[85vh] custom-scrollbar">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
            {editing ? '编辑自定义服务商' : '创建自定义服务商'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 rounded-2xl bg-blue-50/50 p-4 border border-blue-100/50 dark:bg-blue-500/5 dark:border-blue-500/10">
          <div className="mb-1.5 text-xs font-semibold text-blue-800 dark:text-blue-300">AI 一键生成与导入</div>
          <div data-selectable-text className="mb-3 text-[11px] leading-relaxed text-blue-600/80 dark:text-blue-400/80">
            复制提示词发给 LLM，可根据 API 文档自动生成完整的配置（包含服务商、模型、URL 等）。复制 LLM 输出的 JSON 后，点击“从剪贴板粘贴并导入”即可一键生效。
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative inline-flex">
              <button
                type="button"
                onClick={onCopyLlmPrompt}
                aria-label="复制用于生成完整导入 JSON 的 LLM 提示词"
                onMouseEnter={() => setLlmPromptTooltipVisible(true)}
                onMouseLeave={() => setLlmPromptTooltipVisible(false)}
                onFocus={() => setLlmPromptTooltipVisible(true)}
                onBlur={() => setLlmPromptTooltipVisible(false)}
                onTouchStart={() => {
                  clearLlmPromptTooltipTimer()
                  llmPromptTooltipTimerRef.current = window.setTimeout(() => {
                    setLlmPromptTooltipVisible(true)
                    llmPromptTooltipTimerRef.current = null
                  }, 450)
                }}
                onTouchEnd={clearLlmPromptTooltipTimer}
                onTouchCancel={clearLlmPromptTooltipTimer}
                className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-medium text-blue-600 shadow-sm border border-blue-200/50 transition hover:bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/20"
              >
                复制生成提示词
              </button>
              <ViewportTooltip visible={llmPromptTooltipVisible} className="w-56 whitespace-normal text-center">
                生成完整的服务商和配置信息，包含模型和接口地址，导入后只需填入 API Key。
              </ViewportTooltip>
            </span>
            <button
              type="button"
              onClick={onImportJson}
              className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-medium text-blue-600 shadow-sm border border-blue-200/50 transition hover:bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/20"
            >
              从剪贴板粘贴并导入
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">手动编辑 (仅接口映射 Manifest)</span>
            <textarea
              value={json}
              onChange={(event) => onJsonChange(event.target.value)}
              spellCheck={false}
              className="min-h-[420px] w-full resize-y rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 font-mono text-xs leading-relaxed text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
            />
          </label>
        </div>

        {error && (
          <div data-selectable-text className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-500 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2 pb-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
          >
            {editing ? '保存修改' : '创建并使用'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
