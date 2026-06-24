export type AnnouncementTone = 'muted' | 'success' | 'warning'

export interface TimelineAnnouncement {
  id: string
  message: string
  meta: string
  tone?: AnnouncementTone
  enabled?: boolean
}

export interface ModalAnnouncement {
  id: string
  title: string
  message: string
  confirmText?: string
  enabled?: boolean
}

export const modalAnnouncements: ModalAnnouncement[] = [
  {
    id: '20260625-000948-4k-resolution-limit',
    title: '4K 分辨率边长限制说明',
    message: '经测试，目前边长约束为：若有一条边长 > 2160，则另一条边长必须 <= 2160，所以 4K 分辨率下 2:3 / 3:2 / 4:3 / 3:4 通常都会报错 size exceeds the maximum supported resolution，请使用“自定义宽高”，修改分辨率。\n\n因最近 Codex 修改频繁，故暂没有直接修改内置分辨率，请手动修改，谢谢理解。',
    confirmText: '我知道了',
  },
]

export const timelineAnnouncements: TimelineAnnouncement[] = [
  {
    id: '20260625-000948-4k-resolution-limit',
    message: '经测试，目前边长约束为：若有一条边长 > 2160，则另一条边长必须 <= 2160，所以 4K 分辨率下 2:3 / 3:2 / 4:3 / 3:4 通常都会报错 size exceeds the maximum supported resolution，请使用“自定义宽高”，修改分辨率。\n\n因最近 Codex 修改频繁，故暂没有直接修改内置分辨率，请手动修改，谢谢理解。',
    meta: '2026-06-25',
    tone: 'warning',
  },
  {
    id: '2026-06-24-resolution-selection-restored',
    message: '因 Codex 再次接受传参，已恢复具体分辨率选择',
    meta: '2026-06-24',
    tone: 'success',
  },
  {
    id: '2026-06-20-resolution-selection-disabled',
    message: '因 Codex 不再接受传参，已禁止选择具体分辨率，仅支持比例选择',
    meta: '2026-06-20',
    tone: 'warning',
  },
  {
    id: '2026-06-15-default-model-gpt-image-2',
    message: '将默认模型修改为 gpt-image-2',
    meta: '2026-06-15',
  },
  {
    id: '2026-06-14-reference-image-upload-fix',
    message: '修复上传参考图会导致生图失败的 BUG',
    meta: '2026-06-14',
  },
  {
    id: '2026-06-10-codex-cli-compatible-mode',
    message: '因 Codex 不接受质量参数，故默认开启 Codex CLI 兼容模式',
    meta: '2026-06-10',
  },
]

const DISMISSED_MODAL_ANNOUNCEMENTS_KEY = 'cctq-image-dismissed-modal-announcements'

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getDismissedModalAnnouncementIds(): string[] {
  if (!canUseLocalStorage()) return []

  try {
    const raw = window.localStorage.getItem(DISMISSED_MODAL_ANNOUNCEMENTS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function dismissModalAnnouncement(id: string) {
  if (!canUseLocalStorage()) return

  const dismissedIds = new Set(getDismissedModalAnnouncementIds())
  dismissedIds.add(id)
  window.localStorage.setItem(DISMISSED_MODAL_ANNOUNCEMENTS_KEY, JSON.stringify([...dismissedIds]))
}

export function getFirstUnreadModalAnnouncement() {
  const dismissedIds = new Set(getDismissedModalAnnouncementIds())
  return modalAnnouncements.find((announcement) => announcement.enabled !== false && !dismissedIds.has(announcement.id)) ?? null
}
