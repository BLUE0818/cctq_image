import type { InputImage, MaskDraft } from '../types'

export interface InputDraftState {
  inputImages: InputImage[]
  maskDraft: MaskDraft | null
  maskEditorImageId: string | null
}

export function orderImagesWithMaskFirst(images: InputImage[], maskTargetImageId: string | null | undefined) {
  if (!maskTargetImageId) return images
  const maskIndex = images.findIndex((image) => image.id === maskTargetImageId)
  if (maskIndex <= 0) return images
  const ordered = [...images]
  const [maskImage] = ordered.splice(maskIndex, 1)
  ordered.unshift(maskImage)
  return ordered
}

export function replaceDraftImage(state: InputDraftState, index: number, image: InputImage): Partial<InputDraftState> | null {
  if (index < 0 || index >= state.inputImages.length) return null
  if (state.inputImages.some((item, itemIndex) => itemIndex !== index && item.id === image.id)) return null

  const replaced = state.inputImages[index]
  const inputImages = state.inputImages.map((item, itemIndex) => itemIndex === index ? image : item)
  const shouldClearMask = replaced.id === state.maskDraft?.targetImageId
  return {
    inputImages,
    ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
  }
}

export function removeDraftImage(state: InputDraftState, index: number): Partial<InputDraftState> {
  const removed = state.inputImages[index]
  const shouldClearMask = removed?.id === state.maskDraft?.targetImageId
  return {
    inputImages: state.inputImages.filter((_, itemIndex) => itemIndex !== index),
    ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
  }
}

export function setDraftImages(state: InputDraftState, images: InputImage[]): Partial<InputDraftState> {
  const inputImages = orderImagesWithMaskFirst(images, state.maskDraft?.targetImageId)
  const shouldClearMask = Boolean(state.maskDraft) && !inputImages.some((image) => image.id === state.maskDraft?.targetImageId)
  return {
    inputImages,
    ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
  }
}

export function moveDraftImage(state: InputDraftState, fromIndex: number, toIndex: number): InputImage[] | null {
  const images = [...state.inputImages]
  if (fromIndex < 0 || fromIndex >= images.length) return null
  const maskTargetImageId = state.maskDraft?.targetImageId
  if (maskTargetImageId && images[fromIndex]?.id === maskTargetImageId) return null

  const minTargetIndex = maskTargetImageId && images.some((image) => image.id === maskTargetImageId) ? 1 : 0
  const targetIndex = Math.max(minTargetIndex, Math.min(images.length, toIndex))
  const insertIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex
  if (insertIndex === fromIndex) return null
  const [moved] = images.splice(fromIndex, 1)
  images.splice(insertIndex, 0, moved)
  return images
}
