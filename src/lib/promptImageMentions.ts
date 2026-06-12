import type { InputImage } from '../types'

export interface AtImageQuery {
  start: number
  query: string
}

export function getImageMentionLabel(index: number) {
  return `@图${index + 1}`
}

export function getAtImageQuery(prompt: string, cursor: number, inputImages: InputImage[]): AtImageQuery | null {
  if (inputImages.length === 0) return null

  const beforeCursor = prompt.slice(0, cursor)
  const atIndex = beforeCursor.lastIndexOf('@')
  if (atIndex < 0) return null

  const query = beforeCursor.slice(atIndex + 1)
  if (/\s/.test(query)) return null
  const completedMention = query.match(/^图(\d+)$/)
  if (completedMention) {
    const index = Number(completedMention[1]) - 1
    if (inputImages[index]) return null
  }

  return { start: atIndex, query }
}

export function imageMentionMatches(query: string, index: number) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  const oneBasedIndex = String(index + 1)
  const label = `图${oneBasedIndex}`
  return oneBasedIndex.includes(normalized) || label.toLowerCase().includes(normalized)
}

export function insertImageMention(prompt: string, start: number, cursor: number, imageIndex: number) {
  const mention = getImageMentionLabel(imageIndex)
  const prefix = start > 0 && prompt[start - 1] !== ' ' ? ' ' : ''
  const suffix = prompt.slice(cursor)
  const separator = suffix.startsWith(' ') || suffix.length === 0 ? '' : ' '
  const nextPrompt = `${prompt.slice(0, start)}${prefix}${mention}${separator}${suffix}`
  return {
    prompt: nextPrompt,
    cursor: start + prefix.length + mention.length + separator.length,
  }
}

export type PromptMentionPart =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; imageIndex: number }

export function getPromptMentionParts(prompt: string, inputImages: InputImage[]): PromptMentionPart[] {
  const parts: PromptMentionPart[] = []
  let lastIndex = 0

  for (const match of prompt.matchAll(/@图(\d+)/g)) {
    const text = match[0]
    const index = Number(match[1]) - 1
    if (!inputImages[index] || match.index == null) continue

    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: prompt.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'mention', text, imageIndex: index })
    lastIndex = match.index + text.length
  }

  if (lastIndex < prompt.length) {
    parts.push({ type: 'text', text: prompt.slice(lastIndex) })
  }

  return parts.length > 0 ? parts : [{ type: 'text', text: prompt }]
}

export function replaceImageMentionsForApi(prompt: string): string {
  return prompt.replace(/@图(\d+)/g, (_, n) => `[image ${n}]`)
}
