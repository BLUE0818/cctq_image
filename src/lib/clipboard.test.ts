import { afterEach, describe, expect, it, vi } from 'vitest'
import { canCopyImageToClipboard, copyBlobToClipboard } from './clipboard'

function stubClipboardEnvironment(isSecureContext: boolean, hasWrite = true) {
  vi.stubGlobal('window', { isSecureContext })
  vi.stubGlobal('navigator', {
    clipboard: hasWrite ? { write: vi.fn() } : {},
  })
  vi.stubGlobal('ClipboardItem', class ClipboardItem {})
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('image clipboard availability', () => {
  it('allows image copying in a secure context with the image clipboard API', () => {
    stubClipboardEnvironment(true)

    expect(canCopyImageToClipboard()).toBe(true)
  })

  it('rejects image copying in a non-secure HTTP context', async () => {
    stubClipboardEnvironment(false)

    expect(canCopyImageToClipboard()).toBe(false)
    await expect(copyBlobToClipboard(new Blob([], { type: 'image/png' }))).rejects.toThrow(
      'Clipboard image API is not available',
    )
  })

  it('rejects image copying when clipboard.write is unavailable', () => {
    stubClipboardEnvironment(true, false)

    expect(canCopyImageToClipboard()).toBe(false)
  })
})
