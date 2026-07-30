import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { dismissModalAnnouncement, getFirstUnreadModalAnnouncement, type ModalAnnouncement } from '../lib/announcements'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon } from './icons'

export default function AnnouncementModal() {
  const [announcement, setAnnouncement] = useState<ModalAnnouncement | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAnnouncement(getFirstUnreadModalAnnouncement())
  }, [])

  const close = () => {
    if (announcement) dismissModalAnnouncement(announcement.id)
    setAnnouncement(null)
  }

  useCloseOnEscape(Boolean(announcement), close)
  usePreventBackgroundScroll(Boolean(announcement), modalRef)

  if (!announcement) return null

  return createPortal(
    <div
      data-no-drag-select
      className="fixed inset-0 z-[115] flex items-center justify-center p-4"
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm animate-overlay-in dark:bg-black/45" />
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-500/15 dark:text-blue-300">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M4 5h16" />
                <path d="M4 12h16" />
                <path d="M4 19h10" />
              </svg>
            </span>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              {announcement.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭公告"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-5 whitespace-pre-line text-sm leading-6 text-gray-600 dark:text-gray-300">
          {announcement.message}
        </p>
        {announcement.link && (
          <a
            href={announcement.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-500 transition hover:text-blue-600 dark:text-blue-300 dark:hover:text-blue-200"
          >
            {announcement.link.label}
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>
        )}

        <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {announcement.confirmText ?? '我知道了'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
