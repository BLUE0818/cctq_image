import { useEffect, useMemo, useRef, useState } from 'react'
import { calculateImageSize, normalizeImageSize, parseRatio, type SizeTier } from '../lib/size'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import ViewportTooltip from './ViewportTooltip'

const TIERS: SizeTier[] = ['1K', '2K', '4K']
const SIZE_LIMIT_TEXT = '由于模型限制，最终输出会自动规整到合法尺寸：宽高均为 16 的倍数，最大边长 3840px，宽高比不超过 3:1，总像素限制为 655360-8294400。'
const TIER_MODE_LOCKED = true
const RESOLUTION_MODE_LOCKED = true
const RESOLUTION_LOCK_TEXT = '因Codex不再接收传参，故暂时无法选择。'
const SHOW_SIZE_PREVIEW = false
const RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '21:9', value: '21:9' },
]

interface Props {
  currentSize: string
  onSelect: (size: string, aspectRatio?: string | null) => void
  onClose: () => void
  allowAuto?: boolean
}

type Mode = 'auto' | 'ratio' | 'resolution'
type LockHintTarget = 'resolution' | SizeTier

function parseSize(size: string) {
  const match = size.match(/^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/)
  if (!match) return null
  return { width: match[1], height: match[2] }
}

function findPresetForSize(size: string) {
  const normalized = normalizeImageSize(size)
  for (const tier of TIERS) {
    for (const ratio of RATIOS) {
      if (calculateImageSize(tier, ratio.value) === normalized) {
        return { tier, ratio: ratio.value }
      }
    }
  }
  return null
}

export default function SizePickerModal({ currentSize, onSelect, onClose, allowAuto = true }: Props) {
  usePreventBackgroundScroll(true)

  const modalRef = useRef<HTMLDivElement>(null)
  const mouseDownTargetRef = useRef<EventTarget | null>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownTargetRef.current = e.target
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    const mouseDownTarget = mouseDownTargetRef.current
    const mouseUpTarget = e.target

    if (
      modalRef.current &&
      mouseDownTarget &&
      !modalRef.current.contains(mouseDownTarget as Node) &&
      mouseUpTarget &&
      !modalRef.current.contains(mouseUpTarget as Node)
    ) {
      onClose()
    }
    mouseDownTargetRef.current = null
  }

  const currentPreset = findPresetForSize(currentSize)
  const currentParsedSize = parseSize(currentSize)
  const [mode, setMode] = useState<Mode>(() => {
    if (!currentSize || currentSize === 'auto') return allowAuto ? 'auto' : 'ratio'
    if (currentPreset) return 'ratio'
    if (RESOLUTION_MODE_LOCKED) return 'ratio'
    return 'resolution'
  })

  // Ratio mode state
  const [tier, setTier] = useState<SizeTier>(currentPreset?.tier ?? '1K')
  const [ratio, setRatio] = useState(currentPreset?.ratio ?? (allowAuto ? '1:1' : '4:3'))
  const [customRatio, setCustomRatio] = useState('16:9')

  // Resolution mode state
  const [customW, setCustomW] = useState(currentParsedSize?.width ?? '1024')
  const [customH, setCustomH] = useState(currentParsedSize?.height ?? '1024')

  const [hintVisible, setHintVisible] = useState(false)
  const [lockHintTarget, setLockHintTarget] = useState<LockHintTarget | null>(null)
  const hintTimerRef = useRef<number | null>(null)
  const resolutionLockHintTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (hintTimerRef.current != null) window.clearTimeout(hintTimerRef.current)
    clearResolutionLockHintTimer()
  }, [])

  const activeRatio = ratio === 'custom' ? customRatio : ratio
  const parsedCustomRatio = parseRatio(customRatio)
  const customRatioValid = ratio !== 'custom' || Boolean(parsedCustomRatio)
  const customRatioClamped = Boolean(
    ratio === 'custom' &&
    parsedCustomRatio &&
    Math.max(parsedCustomRatio.width, parsedCustomRatio.height) / Math.min(parsedCustomRatio.width, parsedCustomRatio.height) > 3,
  )

  const previewSize = useMemo(() => {
    if (mode === 'auto') return 'auto'
    
    if (mode === 'ratio') {
      const size = calculateImageSize(tier, activeRatio)
      return size ? normalizeImageSize(size) : ''
    }
    
    if (mode === 'resolution') {
      const w = parseInt(customW, 10)
      const h = parseInt(customH, 10)
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        return normalizeImageSize(`${w}x${h}`)
      }
      return ''
    }
    
    return ''
  }, [mode, tier, activeRatio, customW, customH])

  const isClamped = useMemo(() => {
    if (!previewSize || previewSize === 'auto') return false
    if (mode === 'ratio' && ratio === 'custom') return customRatioClamped
    if (mode === 'resolution') {
      const w = parseInt(customW, 10)
      const h = parseInt(customH, 10)
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        return `${w}x${h}` !== previewSize
      }
    }
    return false
  }, [mode, ratio, customRatioClamped, customW, customH, previewSize])

  const showHint = () => setHintVisible(true)
  const hideHint = () => {
    setHintVisible(false)
    clearHintTimer()
  }
  const clearHintTimer = () => {
    if (hintTimerRef.current != null) {
      window.clearTimeout(hintTimerRef.current)
      hintTimerRef.current = null
    }
  }
  const startHintTouch = () => {
    hintTimerRef.current = window.setTimeout(() => {
      setHintVisible(true)
      hintTimerRef.current = null
    }, 450)
  }
  const showResolutionLockHint = (target: LockHintTarget) => {
    setLockHintTarget(target)
  }
  const hideResolutionLockHint = () => {
    setLockHintTarget(null)
    clearResolutionLockHintTimer()
  }
  const clearResolutionLockHintTimer = () => {
    if (resolutionLockHintTimerRef.current != null) {
      window.clearTimeout(resolutionLockHintTimerRef.current)
      resolutionLockHintTimerRef.current = null
    }
  }
  const startResolutionLockHintTouch = (target: LockHintTarget) => {
    resolutionLockHintTimerRef.current = window.setTimeout(() => {
      setLockHintTarget(target)
      resolutionLockHintTimerRef.current = null
    }, 450)
  }

  const applySize = () => {
    if (!previewSize) return
    onSelect(previewSize, mode === 'ratio' && customRatioValid ? activeRatio : null)
    onClose()
  }

  const buttonClass = (active: boolean) => {
    return `rounded-xl border px-3 py-2 text-sm transition ${active
      ? 'border-blue-400 bg-blue-50 text-blue-600 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-300'
      : 'border-gray-200/70 bg-white/60 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]'
    }`
  }

  const lockedButtonClass = 'relative rounded-xl border border-red-200/70 bg-red-50 px-3 py-2 text-sm text-red-400 transition cursor-not-allowed hover:bg-red-50 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-300'

  return (
    <div
      data-no-drag-select
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">设置图像尺寸</h3>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">当前：{currentSize || 'auto'}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex rounded-xl bg-gray-100/80 p-1 dark:bg-white/[0.04]">
            {allowAuto && (
              <button
                onClick={() => setMode('auto')}
                className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${mode === 'auto' ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
              >
                自动
              </button>
            )}
            <button
              onClick={() => setMode('ratio')}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${mode === 'ratio' ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
            >
              按比例
            </button>
            <button
              onClick={() => {
                if (RESOLUTION_MODE_LOCKED) {
                  showResolutionLockHint('resolution')
                  return
                }
                setMode('resolution')
              }}
              onMouseEnter={() => RESOLUTION_MODE_LOCKED && showResolutionLockHint('resolution')}
              onMouseLeave={hideResolutionLockHint}
              onTouchStart={() => RESOLUTION_MODE_LOCKED && startResolutionLockHintTouch('resolution')}
              onTouchEnd={clearResolutionLockHintTimer}
              onTouchCancel={hideResolutionLockHint}
              aria-disabled={RESOLUTION_MODE_LOCKED}
              title={RESOLUTION_MODE_LOCKED ? RESOLUTION_LOCK_TEXT : undefined}
              className={`relative flex-1 rounded-lg py-1.5 text-sm font-medium transition ${RESOLUTION_MODE_LOCKED
                ? 'cursor-not-allowed bg-red-50 text-red-400 ring-1 ring-inset ring-red-200/70 hover:bg-red-50 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/25'
                : mode === 'resolution'
                  ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              自定义宽高
              <ViewportTooltip visible={lockHintTarget === 'resolution'} className="w-64 whitespace-normal text-center">
                {RESOLUTION_LOCK_TEXT}
              </ViewportTooltip>
            </button>
          </div>

          <div className="min-h-[220px]">
            {mode === 'auto' && (
              <div className="flex h-full animate-fade-in items-center justify-center pt-8 pb-4 text-center">
                <div>
                  <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-500/10">
                    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">自动尺寸</h4>
                  <p className="mt-2 text-xs text-gray-400 leading-relaxed dark:text-gray-500">
                    不向模型传递具体的分辨率参数
                    <br />
                    由模型自己决定生成尺寸
                  </p>
                </div>
              </div>
            )}

            {mode === 'ratio' && (
              <div className="space-y-5 animate-fade-in">
                <section>
                  <div className="mb-2 text-xs font-medium text-gray-400 dark:text-gray-500">基准分辨率</div>
                  <div className="grid grid-cols-3 gap-2">
                    {TIERS.map((item) => (
                      <button
                        key={item}
                        className={TIER_MODE_LOCKED ? lockedButtonClass : buttonClass(tier === item)}
                        onClick={() => {
                          if (TIER_MODE_LOCKED) {
                            showResolutionLockHint(item)
                            return
                          }
                          setTier(item)
                        }}
                        onMouseEnter={() => TIER_MODE_LOCKED && showResolutionLockHint(item)}
                        onMouseLeave={hideResolutionLockHint}
                        onTouchStart={() => TIER_MODE_LOCKED && startResolutionLockHintTouch(item)}
                        onTouchEnd={clearResolutionLockHintTimer}
                        onTouchCancel={hideResolutionLockHint}
                        aria-disabled={TIER_MODE_LOCKED}
                        title={TIER_MODE_LOCKED ? RESOLUTION_LOCK_TEXT : undefined}
                      >
                        {item}
                        <ViewportTooltip visible={lockHintTarget === item} className="w-64 whitespace-normal text-center">
                          {RESOLUTION_LOCK_TEXT}
                        </ViewportTooltip>
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-2 text-xs font-medium text-gray-400 dark:text-gray-500">图像比例</div>
                  <div className="grid grid-cols-4 gap-2">
                    {RATIOS.map((item) => (
                      <button key={item.value} className={buttonClass(ratio === item.value)} onClick={() => setRatio(item.value)}>
                        {item.label}
                      </button>
                    ))}
                    <button className={`${buttonClass(ratio === 'custom')} col-span-4`} onClick={() => setRatio('custom')}>
                      自定义比例
                    </button>
                  </div>
                </section>

                {ratio === 'custom' && (
                  <label className="block animate-fade-in">
                    <span className="mb-2 block text-xs font-medium text-gray-400 dark:text-gray-500">输入自定义比例</span>
                    <input
                      value={customRatio}
                      onChange={(e) => setCustomRatio(e.target.value)}
                      placeholder="例如 5:4 / 2.39:1"
                      className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${
                        customRatioValid
                          ? 'border-gray-200/70 bg-white/60 text-gray-700 focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50'
                          : 'border-red-300 bg-white/60 text-gray-700 focus:border-red-400 dark:border-red-500/40 dark:bg-white/[0.03] dark:text-gray-200'
                      }`}
                    />
                  </label>
                )}
              </div>
            )}

            {mode === 'resolution' && (
              <div className="space-y-5 animate-fade-in">
                <section>
                  <div className="mb-4 text-xs font-medium text-gray-400 dark:text-gray-500">输入具体像素值</div>
                  <div className="flex items-center gap-4">
                    <label className="flex-1">
                      <span className="mb-1.5 block text-xs text-gray-500 dark:text-gray-400">宽度 (Width)</span>
                      <input
                        type="number"
                        value={customW}
                        onChange={(e) => setCustomW(e.target.value)}
                        className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                        placeholder="例如 1024"
                      />
                    </label>
                    <div className="mt-5 text-gray-300 dark:text-gray-600">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <label className="flex-1">
                      <span className="mb-1.5 block text-xs text-gray-500 dark:text-gray-400">高度 (Height)</span>
                      <input
                        type="number"
                        value={customH}
                        onChange={(e) => setCustomH(e.target.value)}
                        className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                        placeholder="例如 1024"
                      />
                    </label>
                  </div>
                </section>
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400">
                  <p className="flex items-start gap-1.5">
                    <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{SIZE_LIMIT_TEXT}</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {SHOW_SIZE_PREVIEW && (
            <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
              <div className="text-xs text-gray-400 dark:text-gray-500">将使用</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-lg font-semibold text-gray-800 dark:text-gray-100">
                  {previewSize || '尺寸无效'}
                </span>
                {isClamped && (
                  <div
                    className="relative flex items-center"
                    onMouseEnter={showHint}
                    onMouseLeave={hideHint}
                    onTouchStart={startHintTouch}
                    onTouchEnd={clearHintTimer}
                    onTouchCancel={hideHint}
                    onClick={showHint}
                  >
                    <svg className="w-5 h-5 text-yellow-500 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <ViewportTooltip visible={hintVisible} className="w-56 whitespace-normal text-center">
                      {SIZE_LIMIT_TEXT}
                    </ViewportTooltip>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
          >
            取消
          </button>
          <button
            onClick={applySize}
            disabled={!previewSize}
            className="flex-1 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
