import { describe, it, expect } from 'vitest'
import { getNextOpenPosition, CARD_DIMENSIONS, CANVAS_GAP } from './canvas-utils'
import type { CanvasCardPosition } from '@/lib/brew-v2-types'

describe('getNextOpenPosition', () => {
  const cardWidth = CARD_DIMENSIONS.candidate.width   // 168
  const cardHeight = CARD_DIMENSIONS.candidate.height // 220
  const gap = CANVAS_GAP                              // 16
  const canvasWidth = 800

  function makePosition(id: string, x: number, y: number): CanvasCardPosition {
    return { id, x, y, type: 'candidate', updatedAt: Date.now() }
  }

  it('returns (0, 0) when no existing positions', () => {
    const result = getNextOpenPosition([], cardWidth, cardHeight, canvasWidth, gap)
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('returns the second cell when (0,0) is occupied', () => {
    const existing = [makePosition('card1', 0, 0)]
    const result = getNextOpenPosition(existing, cardWidth, cardHeight, canvasWidth, gap)
    const cellWidth = cardWidth + gap // 184
    expect(result).toEqual({ x: cellWidth, y: 0 })
  })

  it('wraps to the next row when a row is full', () => {
    const cellWidth = cardWidth + gap   // 184
    const cellHeight = cardHeight + gap  // 236
    const cols = Math.floor(canvasWidth / cellWidth) // 800 / 184 = 4

    // Fill all cells in the first row
    const existing: CanvasCardPosition[] = []
    for (let col = 0; col < cols; col++) {
      existing.push(makePosition(`card${col}`, col * cellWidth, 0))
    }

    const result = getNextOpenPosition(existing, cardWidth, cardHeight, canvasWidth, gap)
    expect(result).toEqual({ x: 0, y: cellHeight })
  })

  it('finds a gap in the middle of a row', () => {
    const cellWidth = cardWidth + gap // 184

    // Occupy cell 0 and cell 2, leaving cell 1 open
    const existing = [
      makePosition('card0', 0, 0),
      makePosition('card2', cellWidth * 2, 0),
    ]

    const result = getNextOpenPosition(existing, cardWidth, cardHeight, canvasWidth, gap)
    expect(result).toEqual({ x: cellWidth, y: 0 })
  })

  it('handles a card positioned off-grid (marks overlapping cells)', () => {
    const cellWidth = cardWidth + gap   // 184
    const cellHeight = cardHeight + gap  // 236

    // Place a card straddling cells (0,0) and (1,0) by positioning it at half a cell
    const existing = [makePosition('card1', cellWidth / 2, 0)]

    const result = getNextOpenPosition(existing, cardWidth, cardHeight, canvasWidth, gap)
    // Cells (0,0) and (1,0) should both be marked occupied
    // First open cell should be (2,0)
    expect(result).toEqual({ x: cellWidth * 2, y: 0 })
  })

  it('works with narrow canvas (single column)', () => {
    const cellWidth = cardWidth + gap   // 184
    const cellHeight = cardHeight + gap  // 236
    const narrowCanvas = 184 // fits exactly 1 column

    const existing = [makePosition('card0', 0, 0)]
    const result = getNextOpenPosition(existing, cardWidth, cardHeight, narrowCanvas, gap)
    expect(result).toEqual({ x: 0, y: cellHeight })
  })

  it('uses default gap when not specified', () => {
    const result = getNextOpenPosition([], cardWidth, cardHeight, canvasWidth)
    expect(result).toEqual({ x: 0, y: 0 })
  })
})

describe('CARD_DIMENSIONS', () => {
  it('exports correct dimensions for all card types', () => {
    expect(CARD_DIMENSIONS.candidate).toEqual({ width: 168, height: 220 })
    expect(CARD_DIMENSIONS.decision).toEqual({ width: 152, height: 60 })
    expect(CARD_DIMENSIONS.deckCard).toEqual({ width: 140, height: 180 })
    expect(CARD_DIMENSIONS.deckName).toEqual({ width: 168, height: 48 })
  })
})

describe('CANVAS_GAP', () => {
  it('exports 16', () => {
    expect(CANVAS_GAP).toBe(16)
  })
})
