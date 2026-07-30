import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { timelineAnnouncements, type AnnouncementTone } from '../lib/announcements'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon } from './icons'

interface AnnouncementBoardModalProps {
  onClose: () => void
}

const markerClassByTone: Record<AnnouncementTone, string> = {
  muted: 'bg-gray-300 dark:bg-gray-600',
  success: 'bg-green-500',
  warning: 'bg-orange-500',
}

export default function AnnouncementBoardModal({ onClose }: AnnouncementBoardModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const announcements = timelineAnnouncements.filter((announcement) => announcement.enabled !== false)

  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true, modalRef)

  return createPortal(
    <div
      data-no-drag-select
      className="fixed inset-0 z-[105] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm animate-overlay-in dark:bg-black/45" />
      <div
        ref={modalRef}
        className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">公告</h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{announcements.length} 条</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭公告"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="ios-rounded-scroll-fix tiny-scrollbar flex-1 overflow-y-auto px-5 py-4">
          <ol>
            {announcements.map((announcement, index) => {
              const tone = announcement.tone ?? 'muted'
              const isLast = index === announcements.length - 1

              return (
                <li key={announcement.id} className="relative grid grid-cols-[1.25rem_1fr] gap-3">
                  <div className="relative flex justify-center">
                    {!isLast && <span className="absolute top-4 bottom-0 w-px bg-gray-200 dark:bg-white/[0.08]" />}
                    <span className={`relative mt-1 h-2.5 w-2.5 rounded-full ${markerClassByTone[tone]}`} />
                  </div>
                  <div className="pb-5">
                    <p className="whitespace-pre-line text-sm leading-6 text-gray-700 dark:text-gray-200">
                      {announcement.message}
                    </p>
                    {announcement.link && (
                      <a
                        href={announcement.link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-blue-500 transition hover:text-blue-600 dark:text-blue-300 dark:hover:text-blue-200"
                      >
                        {announcement.link.label}
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M7 17 17 7" />
                          <path d="M7 7h10v10" />
                        </svg>
                      </a>
                    )}
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {announcement.meta}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>,
    document.body,
  )
}
