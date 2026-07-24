import { describe, expect, it } from 'vitest'
import {
  getMaskBrushSizeFromPointer,
  MAX_MASK_BRUSH_SIZE,
  MIN_MASK_BRUSH_SIZE,
} from './maskBrushSize'

describe('getMaskBrushSizeFromPointer', () => {
  it('maps the panel ends to the brush size limits', () => {
    expect(getMaskBrushSizeFromPointer(116, 100, 176)).toBe(MAX_MASK_BRUSH_SIZE)
    expect(getMaskBrushSizeFromPointer(260, 100, 176)).toBe(MIN_MASK_BRUSH_SIZE)
  })

  it('clamps pointer positions outside the interactive track', () => {
    expect(getMaskBrushSizeFromPointer(0, 100, 176)).toBe(MAX_MASK_BRUSH_SIZE)
    expect(getMaskBrushSizeFromPointer(400, 100, 176)).toBe(MIN_MASK_BRUSH_SIZE)
  })

  it('maps the track midpoint near the numeric midpoint', () => {
    expect(getMaskBrushSizeFromPointer(188, 100, 176)).toBe(114)
  })
})
