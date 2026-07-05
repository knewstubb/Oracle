import type { CanvasCardPosition } from '@/lib/brew-v2-types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default card dimensions for the various card types */
export const CARD_DIMENSIONS = {
  candidate: { width: 168, height: 220 },  // Phase 1 commander candidate
  decision: { width: 152, height: 60 },    // Phase 1 decision card
  deckCard: { width: 140, height: 180 },   // Phase 2 card view
  deckName: { width: 168, height: 48 },    // Phase 2 name view
} as const

/** Default canvas gap between cards */
export const CANVAS_GAP = 16

// ---------------------------------------------------------------------------
// Positioning Algorithm
// ---------------------------------------------------------------------------

/**
 * Computes the next non-overlapping position for a new card.
 *
 * Algorithm (grid-scan):
 * 1. Define a virtual grid with cell size = (cardWidth + gap) × (cardHeight + gap)
 * 2. Mark cells occupied by existing cards (a card's bounding box may span one
 *    or more cells)
 * 3. Scan left-to-right, top-to-bottom for the first unoccupied cell
 * 4. Return the cell's top-left corner as the position
 *
 * This guarantees no overlaps for newly placed cards. User-dragged cards may
 * overlap intentionally (spatial freedom).
 */
export function getNextOpenPosition(
  existingPositions: CanvasCardPosition[],
  cardWidth: number,
  cardHeight: number,
  canvasWidth: number,
  gap: number = CANVAS_GAP
): { x: number; y: number } {
  const cellWidth = cardWidth + gap
  const cellHeight = cardHeight + gap

  // Number of columns that fit in the canvas width
  const cols = Math.max(1, Math.floor(canvasWidth / cellWidth))

  // Build a set of occupied cell indices.
  // Each existing card may span multiple cells depending on its bounding box
  // relative to the virtual grid.
  const occupied = new Set<string>()

  for (const pos of existingPositions) {
    // Determine which grid cells this card's bounding box overlaps.
    // A card at (pos.x, pos.y) with dimensions (cardWidth × cardHeight)
    // occupies cells from the column/row containing its top-left corner
    // through the column/row containing its bottom-right corner.
    const startCol = Math.floor(pos.x / cellWidth)
    const startRow = Math.floor(pos.y / cellHeight)
    const endCol = Math.floor((pos.x + cardWidth - 1) / cellWidth)
    const endRow = Math.floor((pos.y + cardHeight - 1) / cellHeight)

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        occupied.add(`${c},${r}`)
      }
    }
  }

  // Scan left-to-right, top-to-bottom for the first unoccupied cell
  // that fits within the canvas width.
  let row = 0
  while (true) {
    for (let col = 0; col < cols; col++) {
      if (!occupied.has(`${col},${row}`)) {
        return {
          x: col * cellWidth,
          y: row * cellHeight,
        }
      }
    }
    row++
  }
}
