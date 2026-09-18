import { useEffect, useRef, useState, useCallback } from 'react'
import { hasActiveDataOperations } from '../lib/dataOperations'
import { isApiProxyAvailable, readClientDevProxyConfig } from '../lib/devProxy'
import { useStore, exportData, importData, clearData } from '../store'
import {
  createDefaultOpenAIProfile,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_OPENAI_PROFILE_ID,
  DEFAULT_SETTINGS,
  IMAGE_MODEL_OPTIONS,
  getActiveApiProfile,
  normalizeImageModel,
  normalizeSettings,
} from '../lib/apiProfiles'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import type { ApiProfile, AppSettings, ZipDownloadRoute } from '../types'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { DEFAULT_DROPDOWN_MAX_HEIGHT, getDropdownMaxHeight } from '../lib/dropdown'
import { createProfileImportUrl } from '../lib/settingsProfileImport'
import Checkbox from './Checkbox'
import Select from './Select'
import ViewportTooltip from './ViewportTooltip'
import { ChevronDownIcon, CloseIcon, CopyIcon, PlusIcon, TrashIcon, GithubIcon, ExportIcon, ImportIcon } from './icons'
import ZipDownloadRouteModal, { ZIP_DOWNLOAD_ROUTE_OPTIONS } from './settings/ZipDownloadRouteModal'

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

const modelSelectOptions = IMAGE_MODEL_OPTIONS.map((model) => ({ label: model, value: model }))
export default function SettingsModal() {
  const showSettings = useStore((s) => s.showSettings)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const reusedTaskApiProfileId = useStore((s) => s.reusedTaskApiProfileId)
  const setReusedTaskApiProfile = useStore((s) => s.setReusedTaskApiProfile)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)
  const hasRunningOperations = useStore((s) => hasActiveDataOperations(s.tasks))
  const importInputRef = useRef<HTMLInputElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const profileMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const dataTransferToastAtRef = useRef(0)

  const profileImportUrlTooltipTimerRef = useRef<number | null>(null)
  const settingsScrollBoundaryRef = useRef<HTMLDivElement>(null)
  const zipDownloadRouteScrollBoundaryRef = useRef<HTMLDivElement>(null)
  
  const [draft, setDraft] = useState<AppSettings>(normalizeSettings(settings))
  const [timeoutInput, setTimeoutInput] = useState(String(getActiveApiProfile(settings).timeout))
  const [showApiKey, setShowApiKey] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [profileMenuMaxHeight, setProfileMenuMaxHeight] = useState(DEFAULT_DROPDOWN_MAX_HEIGHT)
  const [showZipDownloadRouteManager, setShowZipDownloadRouteManager] = useState(false)
  const [profileImportUrlTooltipVisible, setProfileImportUrlTooltipVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'api' | 'data'>('general')
  const [exportConfig, setExportConfig] = useState(true)
  const [exportTasks, setExportTasks] = useState(true)
  const [importConfig, setImportConfig] = useState(true)
  const [importTasks, setImportTasks] = useState(true)
  const [clearConfig, setClearConfig] = useState(true)
  const [clearTasks, setClearTasks] = useState(true)
  const [isExportingData, setIsExportingData] = useState(false)
  const [isImportingData, setIsImportingData] = useState(false)

  const apiProxyAvailable = isApiProxyAvailable(readClientDevProxyConfig())
  const activeProfile = draft.profiles.find((profile) => profile.id === draft.activeProfileId) ?? draft.profiles[0] ?? getActiveApiProfile(draft)
  const apiProxyEnabled = apiProxyAvailable && activeProfile.provider === 'openai' && activeProfile.apiProxy
  const activeModel = normalizeImageModel(activeProfile.model)
  const enabledZipDownloadRouteCount = ZIP_DOWNLOAD_ROUTE_OPTIONS.filter((option) => draft.zipDownloadRoutes.includes(option.route)).length
  const zipDownloadRouteSummary = enabledZipDownloadRouteCount
    ? `已开启 ${enabledZipDownloadRouteCount} 项使用压缩包进行批量下载的途径`
    : '未开启任何使用压缩包进行批量下载的途径'
  const wasSettingsOpenRef = useRef(false)

  useEffect(() => {
    if (!showSettings) {
      wasSettingsOpenRef.current = false
      return
    }
    if (wasSettingsOpenRef.current) return

    wasSettingsOpenRef.current = true
    const normalizedSettings = normalizeSettings(settings)
    const displaySettings = normalizedSettings.reuseTaskApiProfileTemporarily && reusedTaskApiProfileId && normalizedSettings.profiles.some((profile) => profile.id === reusedTaskApiProfileId)
      ? normalizeSettings({ ...normalizedSettings, activeProfileId: reusedTaskApiProfileId })
      : normalizedSettings
    const nextDraft = normalizeSettings(apiProxyAvailable ? displaySettings : {
      ...displaySettings,
      profiles: displaySettings.profiles.map((profile) => ({ ...profile, apiProxy: false })),
    })
    setDraft(nextDraft)
    setTimeoutInput(String(getActiveApiProfile(nextDraft).timeout))
  }, [apiProxyAvailable, showSettings, settings, reusedTaskApiProfileId])

  useEffect(() => {
    setTimeoutInput(String(activeProfile.timeout))
  }, [activeProfile.id, activeProfile.timeout])

  const updateProfileMenuMaxHeight = useCallback(() => {
    if (!profileMenuTriggerRef.current) return
    setProfileMenuMaxHeight(getDropdownMaxHeight(profileMenuTriggerRef.current))
  }, [])

  useEffect(() => {
    if (!showProfileMenu) return

    const handlePointerDown = (event: PointerEvent) => {
      if (profileMenuRef.current?.contains(event.target as Node)) return
      setShowProfileMenu(false)
    }

    updateProfileMenuMaxHeight()
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', updateProfileMenuMaxHeight)
    window.addEventListener('scroll', updateProfileMenuMaxHeight, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', updateProfileMenuMaxHeight)
      window.removeEventListener('scroll', updateProfileMenuMaxHeight, true)
    }
  }, [showProfileMenu, updateProfileMenuMaxHeight])

  useEffect(() => () => {
    if (profileImportUrlTooltipTimerRef.current != null) window.clearTimeout(profileImportUrlTooltipTimerRef.current)
  }, [])

  const clearProfileImportUrlTooltipTimer = () => {
    if (profileImportUrlTooltipTimerRef.current != null) {
      window.clearTimeout(profileImportUrlTooltipTimerRef.current)
      profileImportUrlTooltipTimerRef.current = null
    }
  }

  const commitSettings = (nextDraft: AppSettings) => {
    const normalizedProfiles = nextDraft.profiles.map((profile) => {
      return {
        ...profile,
        name: profile.name.trim() || (profile.id === DEFAULT_OPENAI_PROFILE_ID ? '默认' : '新配置'),
        baseUrl: DEFAULT_SETTINGS.baseUrl,
        model: normalizeImageModel(profile.model),
        timeout: Number(profile.timeout) || DEFAULT_SETTINGS.timeout,
        apiProxy: apiProxyAvailable ? profile.apiProxy : false,
      }
    })
    const fallbackProfile = createDefaultOpenAIProfile({ id: newId('openai') })
    const normalizedDraft = normalizeSettings({
      ...nextDraft,
      profiles: normalizedProfiles.length ? normalizedProfiles : [fallbackProfile],
      activeProfileId: normalizedProfiles.some((profile) => profile.id === nextDraft.activeProfileId)
        ? nextDraft.activeProfileId
        : (normalizedProfiles[0]?.id ?? fallbackProfile.id),
    })
    setDraft(normalizedDraft)
    setSettings(normalizedDraft)
  }

  const setZipDownloadRouteEnabled = (route: ZipDownloadRoute, enabled: boolean) => {
    const nextRoutes = enabled
      ? Array.from(new Set([...draft.zipDownloadRoutes, route]))
      : draft.zipDownloadRoutes.filter((item) => item !== route)
    commitSettings({ ...draft, zipDownloadRoutes: nextRoutes })
  }

  const copyProfileImportUrl = async (profile: ApiProfile, includeApiKey: boolean) => {
    try {
      await copyTextToClipboard(createProfileImportUrl(window.location.href, profile, includeApiKey))
      showToast(includeApiKey ? '导入 URL 已复制（包含 API Key）' : '导入 URL 已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制导入 URL 失败', err), 'error')
    }
  }

  const confirmCopyProfileImportUrl = (profile: ApiProfile) => {
    setShowProfileMenu(false)
    setConfirmDialog({
      title: `复制导入配置「${profile.name}」的 URL`,
      message: '是否包含 API Key？',
      cancelText: '不包含',
      confirmText: '包含 API Key',
      action: () => void copyProfileImportUrl(profile, true),
      cancelAction: () => void copyProfileImportUrl(profile, false),
    })
  }

  const getDraftWithActiveProfilePatch = (patch: Partial<ApiProfile>) => ({
      ...draft,
      profiles: draft.profiles.map((profile) => profile.id === activeProfile.id ? { ...profile, ...patch } : profile),
    })

  const updateActiveProfile = (patch: Partial<ApiProfile>, commit = false) => {
    const nextDraft = getDraftWithActiveProfilePatch(patch)
    setDraft(nextDraft)
    if (commit) commitSettings(nextDraft)
  }

  const commitActiveProfilePatch = (patch: Partial<ApiProfile>) => {
    const nextDraft = getDraftWithActiveProfilePatch(patch)
    commitSettings(nextDraft)
  }

  const dataTransferMode = isExportingData ? 'export' : isImportingData ? 'import' : null
  const showDataTransferBusyToast = useCallback(() => {
    const now = Date.now()
    if (now - dataTransferToastAtRef.current < 1000) return
    dataTransferToastAtRef.current = now
    showToast(dataTransferMode === 'export' ? '正在导出中，请稍候' : '正在导入中，请稍候', 'info')
  }, [dataTransferMode, showToast])

  const handleClose = () => {
    if (dataTransferMode) {
      showDataTransferBusyToast()
      return
    }
    if (showZipDownloadRouteManager) {
      setShowZipDownloadRouteManager(false)
      return
    }
    const nextTimeout = Number(timeoutInput)
    const normalizedTimeout =
      timeoutInput.trim() === '' || Number.isNaN(nextTimeout)
        ? DEFAULT_SETTINGS.timeout
        : nextTimeout
    const nextDraft = {
      ...draft,
      profiles: draft.profiles.map((profile) =>
        profile.id === activeProfile.id ? { ...profile, timeout: normalizedTimeout } : profile,
      ),
    }
    commitSettings(nextDraft)
    setShowSettings(false)
  }

  const commitTimeout = useCallback(() => {
    const nextTimeout = Number(timeoutInput)
    const normalizedTimeout =
      timeoutInput.trim() === '' ? DEFAULT_SETTINGS.timeout : Number.isNaN(nextTimeout) ? activeProfile.timeout : nextTimeout
    setTimeoutInput(String(normalizedTimeout))
    updateActiveProfile({ timeout: normalizedTimeout }, true)
  }, [draft, activeProfile.id, activeProfile.provider, activeProfile.timeout, timeoutInput])

  useEffect(() => {
    dataTransferToastAtRef.current = 0
    if (!dataTransferMode) return
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    const preventKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      showDataTransferBusyToast()
    }
    window.addEventListener('keydown', preventKeyDown, true)
    return () => window.removeEventListener('keydown', preventKeyDown, true)
  }, [dataTransferMode, showDataTransferBusyToast])

  const blockDataTransferInteraction = (event: React.SyntheticEvent) => {
    if (!dataTransferMode) return
    event.preventDefault()
    event.stopPropagation()
    showDataTransferBusyToast()
  }

  const blockDataTransferClick = (event: React.SyntheticEvent) => {
    if (!dataTransferMode) return
    event.preventDefault()
    event.stopPropagation()
  }

  useCloseOnEscape(showSettings && !dataTransferMode, handleClose)
  usePreventBackgroundScroll(showSettings, showZipDownloadRouteManager ? zipDownloadRouteScrollBoundaryRef : settingsScrollBoundaryRef)

  if (!showSettings) return null

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) {
      if (importTasks && hasRunningOperations) {
        showToast('当前有任务正在进行，请完成或停止后再导入', 'error')
        e.target.value = ''
        return
      }
      setIsImportingData(true)
      try {
        const imported = await importData(files, { importConfig, importTasks })
        if (imported) {
          const nextDraft = normalizeSettings(useStore.getState().settings)
          setDraft(nextDraft)
          setTimeoutInput(String(getActiveApiProfile(nextDraft).timeout))
          setShowProfileMenu(false)
        }
      } finally {
        setIsImportingData(false)
      }
    }
    e.target.value = ''
  }

  const handleClearAllData = async () => {
    await clearData({ clearConfig, clearTasks })
    const nextDraft = normalizeSettings(useStore.getState().settings)
    setDraft(nextDraft)
    setTimeoutInput(String(getActiveApiProfile(nextDraft).timeout))
    setShowProfileMenu(false)
  }

  const createNewProfile = () => {
    setReusedTaskApiProfile(null)
    const profile = createDefaultOpenAIProfile({ id: newId('openai'), name: '新配置' })
    const nextDraft = normalizeSettings({ 
        ...draft, 
        profiles: [...draft.profiles, profile],
        activeProfileId: profile.id
    })
    commitSettings(nextDraft)
    setShowProfileMenu(false)
  }

  const switchProfile = (id: string) => {
    setReusedTaskApiProfile(null)
    const nextDraft = normalizeSettings({ ...draft, activeProfileId: id })
    commitSettings(nextDraft)
    setShowProfileMenu(false)
  }
  
  const deleteProfile = (id: string) => {
    if (draft.profiles.length <= 1) return
    if (id === reusedTaskApiProfileId) setReusedTaskApiProfile(null)
    const nextProfiles = draft.profiles.filter((item) => item.id !== id)
    const nextDraft = normalizeSettings({
      ...draft,
      profiles: nextProfiles,
      activeProfileId: draft.activeProfileId === id ? nextProfiles[0].id : draft.activeProfileId,
    })
    commitSettings(nextDraft)
  }

  const handleExport = async () => {
    if (exportTasks && hasRunningOperations) {
      showToast('当前有任务正在进行，请完成或停止后再导出', 'error')
      return
    }
    setIsExportingData(true)
    try {
      await exportData({ exportConfig, exportTasks })
    } finally {
      setIsExportingData(false)
    }
  }

  return (
        <div
          data-no-drag-select
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          onPointerDownCapture={blockDataTransferInteraction}
          onClickCapture={blockDataTransferClick}
          onContextMenuCapture={blockDataTransferInteraction}
        >
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in"
        onClick={handleClose}
      />
      <div
        ref={settingsScrollBoundaryRef}
        className="relative z-10 w-full max-w-3xl rounded-3xl border border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 flex h-[85vh] sm:h-[600px] flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 p-5 border-b border-gray-100 dark:border-white/[0.08]">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            设置
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 dark:text-gray-500 font-mono select-none">v{__APP_VERSION__}</span>
            <button
              onClick={handleClose}
              className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              aria-label="关闭"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
          {/* Sidebar */}
          <div className="w-full sm:w-48 shrink-0 flex flex-col border-b sm:border-b-0 sm:border-r border-gray-100 dark:border-white/[0.08] bg-gray-50/50 dark:bg-white/[0.02]">
            <nav className="flex-1 overflow-x-auto sm:overflow-y-auto custom-scrollbar p-3 space-x-1 sm:space-x-0 sm:space-y-1 flex sm:flex-col">
              <button
                onClick={() => setActiveTab('general')}
                className={`whitespace-nowrap flex-shrink-0 flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-xl transition-colors ${activeTab === 'general' ? 'bg-white dark:bg-white/[0.08] shadow-sm text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-white/[0.04]'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                </svg>
                习惯配置
              </button>
              <button
                onClick={() => setActiveTab('api')}
                className={`whitespace-nowrap flex-shrink-0 flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-xl transition-colors ${activeTab === 'api' ? 'bg-white dark:bg-white/[0.08] shadow-sm text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-white/[0.04]'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                API 配置
              </button>
              <button
                onClick={() => setActiveTab('data')}
                className={`whitespace-nowrap flex-shrink-0 flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-xl transition-colors ${activeTab === 'data' ? 'bg-white dark:bg-white/[0.08] shadow-sm text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-white/[0.04]'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                数据管理
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent relative overflow-hidden">
            <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-5 sm:p-6">
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div className="block">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="block text-sm text-gray-600 dark:text-gray-300">提交任务后清空输入框</span>
                    <button
                      type="button"
                      onClick={() => commitSettings({ ...draft, clearInputAfterSubmit: !draft.clearInputAfterSubmit })}
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${draft.clearInputAfterSubmit ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      role="switch"
                      aria-checked={draft.clearInputAfterSubmit}
                      aria-label="提交任务后清空输入框"
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${draft.clearInputAfterSubmit ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
                    </button>
                  </div>
                  <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
                    开启后，提交成功创建任务时会清空提示词和参考图。
                  </div>
                </div>
                <div className="block">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="block text-sm text-gray-600 dark:text-gray-300">重启后加载上次的输入框</span>
                    <button
                      type="button"
                      onClick={() => commitSettings({ ...draft, persistInputOnRestart: !draft.persistInputOnRestart })}
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${draft.persistInputOnRestart ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      role="switch"
                      aria-checked={draft.persistInputOnRestart}
                      aria-label="重启后加载上次的输入框"
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${draft.persistInputOnRestart ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
                    </button>
                  </div>
                  <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
                    关闭后，不再持久化提示词和参考图，下次启动会使用空输入框。
                  </div>
                </div>
                <div className="block">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="block text-sm text-gray-600 dark:text-gray-300">复用配置时临时复用该任务的 API 配置</span>
                    <button
                      type="button"
                      onClick={() => commitSettings({ ...draft, reuseTaskApiProfileTemporarily: !draft.reuseTaskApiProfileTemporarily })}
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${draft.reuseTaskApiProfileTemporarily ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      role="switch"
                      aria-checked={draft.reuseTaskApiProfileTemporarily}
                      aria-label="复用配置时临时复用该任务的 API 配置"
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${draft.reuseTaskApiProfileTemporarily ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
                    </button>
                  </div>
                  <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
                    开启后，复用历史任务时会临时使用该任务的 API 配置，找不到该配置时提交会提示；关闭后，会继续使用当前的 API 配置。
                  </div>
                </div>
                <div className="block">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="block text-sm text-gray-600 dark:text-gray-300">成功任务仍然展示重试按钮</span>
                    <button
                      type="button"
                      onClick={() => commitSettings({ ...draft, alwaysShowRetryButton: !draft.alwaysShowRetryButton })}
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${draft.alwaysShowRetryButton ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      role="switch"
                      aria-checked={draft.alwaysShowRetryButton}
                      aria-label="成功任务仍然展示重试按钮"
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${draft.alwaysShowRetryButton ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
                    </button>
                  </div>
                  <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
                    开启后，即使任务成功生成，也会在任务卡片和详情页显示重试按钮。
                  </div>
                </div>
                <div className="hidden sm:block">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="block text-sm text-gray-600 dark:text-gray-300">任务提交方式</span>
                    <div className="w-36">
                      <Select
                        value={draft.enterSubmit ? 'enter' : 'ctrl-enter'}
                        onChange={(val) => commitSettings({ ...draft, enterSubmit: val === 'enter' })}
                        options={[
                          { label: navigator.userAgent.includes('Mac') ? '⌘ + Enter' : 'Ctrl + Enter', value: 'ctrl-enter' },
                          { label: 'Enter', value: 'enter' },
                        ]}
                        className="w-full px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] text-xs transition-all duration-200 shadow-sm text-gray-700 dark:text-gray-200 outline-none"
                      />
                    </div>
                  </div>
                  <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
                    选择 {navigator.userAgent.includes('Mac') ? '⌘ + Enter' : 'Ctrl + Enter'} 时，Enter 换行；选择 Enter 时，Shift + Enter 换行。
                  </div>
                </div>
                <div className="sm:hidden">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="block text-sm text-gray-600 dark:text-gray-300">任务提交方式</span>
                    <div className="w-36">
                      <Select
                        value={draft.enterSubmit ? 'enter' : 'button'}
                        onChange={(val) => commitSettings({ ...draft, enterSubmit: val === 'enter' })}
                        options={[
                          { label: '发送按钮', value: 'button' },
                          { label: '回车/发送按钮', value: 'enter' },
                        ]}
                        className="w-full px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] text-xs transition-all duration-200 shadow-sm text-gray-700 dark:text-gray-200 outline-none"
                      />
                    </div>
                  </div>
                  <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
                    选择回车/发送按钮时，回车可提交；否则仅使用发送按钮提交。
                  </div>
                </div>
                <div className="block">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="block text-sm text-gray-600 dark:text-gray-300">使用压缩包进行的批量下载途径</span>
                    <button
                      type="button"
                      onClick={() => setShowZipDownloadRouteManager(true)}
                      className="shrink-0 rounded-xl border border-gray-200/80 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-gray-900 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-300 dark:hover:bg-white/[0.08] dark:hover:text-white"
                    >
                      管理
                    </button>
                  </div>
                  <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
                    {zipDownloadRouteSummary}
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'api' && (
              <div className="space-y-4">

              <div className="block">
                <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">API URL</span>
                <div
                  data-selectable-text
                  className="w-full rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-sm text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
                >
                  https://www.cctq.ai
                </div>
              </div>

              {apiProxyAvailable && activeProfile.provider === 'openai' && (
                <div className="block">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="block text-sm text-gray-600 dark:text-gray-300">API 代理</span>
                    <button
                      type="button"
                      onClick={() => updateActiveProfile({ apiProxy: !activeProfile.apiProxy }, true)}
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${activeProfile.apiProxy ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      role="switch"
                      aria-checked={activeProfile.apiProxy}
                      aria-label="API 代理"
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${activeProfile.apiProxy ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
                    </button>
                  </div>
                  <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
                    由当前部署提供同源代理，用于解决浏览器跨域限制；开启后请求会通过代理转发至 CCTQ API。
                  </div>
                </div>
              )}

              <div className="block">
                <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">API Key</span>
                <div className="relative">
                  <input
                    value={activeProfile.apiKey}
                    onChange={(e) => updateActiveProfile({ apiKey: e.target.value })}
                    onBlur={(e) => commitActiveProfilePatch({ apiKey: e.target.value })}
                    type={showApiKey ? 'text' : 'password'}
                    placeholder={'sk-...'}
                    className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 pr-10 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showApiKey ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">
                  模型 ID
                </span>
                <Select
                  value={activeModel}
                  onChange={(value) => {
                    const model = String(value)
                    updateActiveProfile({ model })
                    commitActiveProfilePatch({ model })
                  }}
                  options={modelSelectOptions}
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div data-selectable-text className="mt-1.5 text-xs text-gray-500 dark:text-gray-500">
                  Images API 需要使用 GPT Image 模型，例如 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">{DEFAULT_IMAGES_MODEL}</code>。
                </div>
              </label>

              <label className="block">
                  <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">请求超时 (秒)</span>
                  <input
                    value={timeoutInput}
                    onChange={(e) => setTimeoutInput(e.target.value)}
                    onBlur={commitTimeout}
                    type="number"
                    min={10}
                    max={600}
                    className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                  />
              </label>
            </div>
            )}
            
            {activeTab === 'data' && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-blue-50/50 p-4 border border-blue-100/50 dark:bg-blue-500/5 dark:border-blue-500/10 flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-500/70 dark:text-blue-400/70 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <div className="text-[13px] leading-relaxed text-blue-800/80 dark:text-blue-300/80">
                    所有的配置、任务记录和生成的图片均仅保存在您的浏览器本地（除非您使用的服务商存储了它们）。如果您需要清理浏览器站点数据、重置浏览器或使用其他设备，请先导出备份。
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02] space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <ExportIcon className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                    <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">导出数据</h4>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">过大的备份会自动分片，请允许浏览器下载多个文件</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <Checkbox checked={exportConfig} onChange={setExportConfig} label="包含配置" />
                    <Checkbox checked={exportTasks} onChange={setExportTasks} label="包含任务和图片" />
                  </div>
                  <button
                    onClick={handleExport}
                    disabled={(!exportConfig && !exportTasks) || isExportingData}
                    aria-busy={isExportingData}
                    className="w-full rounded-xl bg-gray-100/80 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50 disabled:hover:bg-gray-100/80 disabled:hover:text-gray-700 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] dark:hover:text-white dark:disabled:hover:bg-white/[0.06] dark:disabled:hover:text-gray-300 flex items-center justify-center gap-2"
                  >
                    {isExportingData ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        导出中...
                      </>
                    ) : (
                      '导出所选数据'
                    )}
                  </button>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02] space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <ImportIcon className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                    <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">导入数据</h4>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">支持一次导入多个普通备份；分片备份需一次选中同一批次的全部 ZIP</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <Checkbox checked={importConfig} onChange={setImportConfig} label="包含配置" />
                    <Checkbox checked={importTasks} onChange={setImportTasks} label="包含任务和图片" />
                  </div>
                  <button
                    onClick={() => importInputRef.current?.click()}
                    disabled={(!importConfig && !importTasks) || isImportingData}
                    aria-busy={isImportingData}
                    className="w-full rounded-xl bg-gray-100/80 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50 disabled:hover:bg-gray-100/80 disabled:hover:text-gray-700 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] dark:hover:text-white dark:disabled:hover:bg-white/[0.06] dark:disabled:hover:text-gray-300 flex items-center justify-center gap-2"
                  >
                    {isImportingData ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        导入中...
                      </>
                    ) : (
                      '从 ZIP 导入所选数据'
                    )}
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".zip"
                    multiple
                    className="hidden"
                    onChange={handleImport}
                  />
                </div>

                <div className="rounded-2xl border border-red-100/50 bg-red-50/30 p-4 dark:border-red-500/10 dark:bg-red-500/5 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <TrashIcon className="w-4 h-4 text-red-500/90 dark:text-red-400" />
                    <h4 className="text-sm font-bold text-red-500/90 dark:text-red-400">清除数据</h4>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <Checkbox checked={clearConfig} onChange={setClearConfig} label="包含配置" tone="danger" />
                    <Checkbox checked={clearTasks} onChange={setClearTasks} label="包含任务和图片" tone="danger" />
                  </div>
                  <button
                    onClick={() =>
                      setConfirmDialog({
                        title: '清空所选数据',
                        message: `确定要清空所选的数据吗？此操作不可恢复。`,
                        action: () => handleClearAllData(),
                      })
                    }
                    disabled={!clearConfig && !clearTasks}
                    className="w-full rounded-xl bg-red-100/80 px-4 py-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-200 hover:text-red-700 disabled:opacity-50 disabled:hover:bg-red-100/80 disabled:hover:text-red-600 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 dark:hover:text-red-300 dark:disabled:hover:bg-red-500/10 dark:disabled:hover:text-red-400"
                  >
                    清空所选数据
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
      </div>

        {showZipDownloadRouteManager && (
          <ZipDownloadRouteModal
            routes={draft.zipDownloadRoutes}
            scrollBoundaryRef={zipDownloadRouteScrollBoundaryRef}
            onSetEnabled={setZipDownloadRouteEnabled}
            onClose={() => setShowZipDownloadRouteManager(false)}
          />
        )}

    </div>
  )
}
