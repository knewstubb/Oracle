import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RailCard } from '@/lib/deck-rail-stats'
import { RailManaByTurn } from './RailManaByTurn'

const card = (name: string, type: string, text: string | null, qty = 1): RailCard => ({ card_name: name, quantity: qty, mana_cost: null, type_line: type, categories: null, oracle_text: text })
const DECK: RailCard[] = [
  card('Forest', 'Basic Land — Forest', null, 38),
  card('Sol Ring', 'Artifact', '{T}: Add {C}{C}.'),
  ...Array.from({ length: 30 }, (_, i) => card(`Beater ${i}`, 'Creature — Elf', 'Trample')),
]

describe('RailManaByTurn', () => {
  it('shows the empty state for a tiny deck and no readout', () => {
    render(<RailManaByTurn cards={[card('Forest', 'Basic Land — Forest', null, 3)]} commanders={[]} />)
    expect(screen.getByText('Add cards to see mana by turn')).toBeTruthy()
    expect(screen.queryByTestId('mana-readout')).toBeNull()
  })
  it('shows the empty state when there are no lands', () => {
    render(<RailManaByTurn cards={[card('Rock', 'Artifact', '{T}: Add {C}.', 20)]} commanders={[]} />)
    expect(screen.getByTestId('mana-empty')).toBeTruthy()
  })
  it('shows a skeleton, then the chart with Turn 4 readout, legend and footnote', async () => {
    render(<RailManaByTurn cards={DECK} commanders={[]} />)
    expect(screen.getByTestId('mana-skeleton')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('mana-readout').textContent).toMatch(/^Turn 4: \d+\.\d mana$/))
    expect(screen.getByText('Average')).toBeTruthy()
    expect(screen.getByText('If all lands untapped')).toBeTruthy()
    expect(screen.getByText('Middle 80% of games')).toBeTruthy()
    expect(screen.getByText('5,000 games · on the play · 2–5 land hands')).toBeTruthy()
    expect(screen.getAllByTestId('mana-turn')).toHaveLength(7)
  })
  it('hover on turn 6 changes the readout and leaving resets to turn 4', async () => {
    render(<RailManaByTurn cards={DECK} commanders={[]} />)
    await waitFor(() => screen.getByTestId('mana-readout'))
    const cols = screen.getAllByTestId('mana-turn')
    fireEvent.mouseEnter(cols[5])
    expect(screen.getByTestId('mana-readout').textContent).toMatch(/^Turn 6:/)
    fireEvent.mouseLeave(cols[5])
    expect(screen.getByTestId('mana-readout').textContent).toMatch(/^Turn 4:/)
    fireEvent.focus(cols[1])
    expect(screen.getByTestId('mana-readout').textContent).toMatch(/^Turn 2:/)
    fireEvent.blur(cols[1])
    expect(screen.getByTestId('mana-readout').textContent).toMatch(/^Turn 4:/)
  })
  it('uses no mana colour variables', () => {
    for (const f of ['RailManaByTurn.tsx', 'ManaByTurnChart.tsx']) {
      expect(readFileSync(join(__dirname, f), 'utf8')).not.toMatch(/--mana-|MANA_FILL/)
    }
  })
})
