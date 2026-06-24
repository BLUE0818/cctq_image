import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ViewportTooltipProps {
  visible: boolean
  children: ReactNode
  className?: string
}

function isAnchorExposed(anchor: HTMLElement, rect: DOMRect) {
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return false
  const el = document.elementFromPoint(x, y)
  return Boolean(el && anchor.contains(el))
}

export default function ViewportTooltip({ visible, children, className = '' }: ViewportTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{
    left: number
    top: number
    arrowLeft: number
    placement: 'top' | 'bottom'
  } | null>(null)

  useEffect(() => {
    if (!visible) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const anchor = anchorRef.current?.parentElement
      const el = tooltipRef.current
      if (!anchor || !el) return

      const margin = 8
      const gap = 8
      const anchorRect = anchor.getBoundingClientRect()
      if (!anchor.getClientRects().length || (anchorRect.width === 0 && anchorRect.height === 0)) {
        setPosition(null)
        return
      }
      if (!isAnchorExposed(anchor, anchorRect)) {
        setPosition(null)
        return
      }

      const tooltipRect = el.getBoundingClientRect()
      const anchorCenter = anchorRect.left + anchorRect.width / 2
      const maxLeft = Math.max(margin, window.innerWidth - tooltipRect.width - margin)
      const left = Math.min(Math.max(anchorCenter - tooltipRect.width / 2, margin), maxLeft)
      const aboveTop = anchorRect.top - tooltipRect.height - gap
      const placement = aboveTop >= margin ? 'top' : 'bottom'
      const top = placement === 'top' ? aboveTop : anchorRect.bottom + gap

      setPosition({
        left,
        top,
        arrowLeft: anchorCenter - left,
        placement,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [visible, children])

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden />
      {visible && createPortal(
        <div
          ref={tooltipRef}
          className={`fixed pointer-events-none rounded-lg bg-gray-800 px-3 py-2 text-xs font-normal text-white shadow-lg ${className}`}
          style={{
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            visibility: position ? 'visible' : 'hidden',
            zIndex: 120,
          }}
        >
          {children}
          <div
            className={`absolute left-0 border-4 border-transparent ${position?.placement === 'bottom' ? 'bottom-full border-b-gray-800' : 'top-full border-t-gray-800'}`}
            style={{
              left: position?.arrowLeft ?? 0,
              transform: 'translateX(-50%)',
            }}
          />
        </div>,
        document.body,
      )}
    </>
  )
}
