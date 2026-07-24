function getMentionTagText(tag: HTMLElement) {
  return tag.dataset.mentionText ?? tag.textContent ?? ''
}

function getNodeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node instanceof HTMLBRElement) return node.dataset.sentinelBr === 'true' ? '' : '\n'
  if (node instanceof HTMLElement && node.classList.contains('mention-tag')) return getMentionTagText(node)
  return Array.from(node.childNodes).map(getNodeText).join('')
}

export function getContentEditablePlainText(element: HTMLElement) {
  return Array.from(element.childNodes).map(getNodeText).join('').replace(/\r\n?/g, '\n')
}

export function getContentEditableCursor(element: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return getContentEditablePlainText(element).length

  try {
    const range = selection.getRangeAt(0)
    if (!element.contains(range.startContainer)) return getContentEditablePlainText(element).length
    const preRange = document.createRange()
    preRange.selectNodeContents(element)
    preRange.setEnd(range.startContainer, range.startOffset)
    return preRange.toString().length
  } catch {
    return getContentEditablePlainText(element).length
  }
}

export function setContentEditableCursor(element: HTMLElement, offset: number) {
  const selection = window.getSelection()
  if (!selection) return

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let node: Text | null = null
  while (walker.nextNode()) {
    node = walker.currentNode as Text
    const mentionTag = node.parentElement?.closest('.mention-tag')
    if (mentionTag) {
      if (remaining <= node.length) {
        const range = document.createRange()
        remaining < node.length / 2 ? range.setStartBefore(mentionTag) : range.setStartAfter(mentionTag)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        return
      }
      remaining -= node.length
      continue
    }
    if (remaining <= node.length) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= node.length
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function getMentionTagHtml(text: string) {
  const escaped = escapeHtml(text)
  return `<span contenteditable="false" class="mention-tag" data-mention-text="${escaped}">${escaped}</span>`
}
