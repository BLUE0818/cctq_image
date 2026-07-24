import { describe, expect, it } from 'vitest'
import {
  moveDraftImage,
  orderImagesWithMaskFirst,
  removeDraftImage,
  replaceDraftImage,
  setDraftImages,
  type InputDraftState,
} from './inputDraftState'

const imageA = { id: 'image-a', dataUrl: 'a' }
const imageB = { id: 'image-b', dataUrl: 'b' }
const imageC = { id: 'image-c', dataUrl: 'c' }

function state(patch: Partial<InputDraftState> = {}): InputDraftState {
  return {
    inputImages: [imageA, imageB, imageC],
    maskDraft: null,
    maskEditorImageId: null,
    ...patch,
  }
}

describe('inputDraftState', () => {
  it('orders the mask target first without mutating the source array', () => {
    const images = [imageA, imageB, imageC]
    expect(orderImagesWithMaskFirst(images, imageC.id)).toEqual([imageC, imageA, imageB])
    expect(images).toEqual([imageA, imageB, imageC])
  })

  it('rejects invalid or duplicate replacements and clears a replaced mask target', () => {
    const masked = state({
      maskDraft: { targetImageId: imageA.id, maskDataUrl: 'mask', updatedAt: 1 },
      maskEditorImageId: imageA.id,
    })
    expect(replaceDraftImage(masked, -1, imageC)).toBeNull()
    expect(replaceDraftImage(masked, 0, imageB)).toBeNull()
    expect(replaceDraftImage(masked, 0, { id: 'replacement', dataUrl: 'new' })).toEqual({
      inputImages: [{ id: 'replacement', dataUrl: 'new' }, imageB, imageC],
      maskDraft: null,
      maskEditorImageId: null,
    })
  })

  it('clears missing mask targets when removing or replacing the image list', () => {
    const masked = state({
      maskDraft: { targetImageId: imageB.id, maskDataUrl: 'mask', updatedAt: 1 },
      maskEditorImageId: imageB.id,
    })
    expect(removeDraftImage(masked, 1)).toMatchObject({ maskDraft: null, maskEditorImageId: null })
    expect(setDraftImages(masked, [imageC])).toEqual({
      inputImages: [imageC],
      maskDraft: null,
      maskEditorImageId: null,
    })
  })

  it('keeps the mask target pinned while other images move', () => {
    const masked = state({
      maskDraft: { targetImageId: imageA.id, maskDataUrl: 'mask', updatedAt: 1 },
    })
    expect(moveDraftImage(masked, 0, 3)).toBeNull()
    expect(moveDraftImage(masked, 2, 0)).toEqual([imageA, imageC, imageB])
  })
})
