export const MIN_MASK_BRUSH_SIZE = 8
export const MAX_MASK_BRUSH_SIZE = 220

export function getMaskBrushSizeFromPointer(
  clientY: number,
  panelTop: number,
  panelHeight: number,
  padding = 16,
) {
  const usableHeight = Math.max(1, panelHeight - padding * 2)
  const offsetY = clientY - panelTop - padding
  const ratio = Math.max(0, Math.min(1, 1 - offsetY / usableHeight))
  return Math.round(MIN_MASK_BRUSH_SIZE + ratio * (MAX_MASK_BRUSH_SIZE - MIN_MASK_BRUSH_SIZE))
}
