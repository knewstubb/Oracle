import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardTooltip } from './CardTooltip'
import type { DeckCard } from '@/lib/brew-v2-types'

const baseCard: DeckCard = {
  card_name: 'Spore Frog',
  primary_category: 'Protection',
  additional_categories: ['Recursion'],
  ownership_status: 'original',
  cmc: 1,
  type_line: 'Creature — Frog',
  oracle_text: 'Sacrifice Spore Frog: Prevent all combat damage that would be dealt this turn.',
  edhrec_inclusion: 42,
  price_ck: 1.49,
}

describe('CardTooltip', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(
      <CardTooltip card={baseCard} visible={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders card name when visible', () => {
    render(<CardTooltip card={baseCard} visible={true} />)
    expect(screen.getByText('Spore Frog')).toBeInTheDocument()
  })

  it('renders type line', () => {
    render(<CardTooltip card={baseCard} visible={true} />)
    expect(screen.getByText('Creature — Frog')).toBeInTheDocument()
  })

  it('renders oracle text with whitespace-pre-wrap', () => {
    render(<CardTooltip card={baseCard} visible={true} />)
    const oracleEl = screen.getByText(/Sacrifice Spore Frog/)
    expect(oracleEl).toBeInTheDocument()
    expect(oracleEl.className).toContain('whitespace-pre-wrap')
  })

  it('renders ownership badge for owned cards (teal)', () => {
    render(<CardTooltip card={baseCard} visible={true} />)
    expect(screen.getByText('Owned')).toBeInTheDocument()
  })

  it('renders ownership badge for proxy cards (amber)', () => {
    const proxyCard: DeckCard = { ...baseCard, ownership_status: 'proxy' }
    render(<CardTooltip card={proxyCard} visible={true} />)
    expect(screen.getByText('Proxy')).toBeInTheDocument()
  })

  it('renders ownership badge for not owned cards (muted)', () => {
    const notOwnedCard: DeckCard = { ...baseCard, ownership_status: 'not_owned' }
    render(<CardTooltip card={notOwnedCard} visible={true} />)
    expect(screen.getByText('Not owned')).toBeInTheDocument()
  })

  it('renders EDHREC % when available', () => {
    render(<CardTooltip card={baseCard} visible={true} />)
    expect(screen.getByText('EDHREC: 42%')).toBeInTheDocument()
  })

  it('does not render EDHREC line when not available', () => {
    const noEdhrec: DeckCard = { ...baseCard, edhrec_inclusion: undefined }
    render(<CardTooltip card={noEdhrec} visible={true} />)
    expect(screen.queryByText(/EDHREC/)).not.toBeInTheDocument()
  })

  it('renders price when available', () => {
    render(<CardTooltip card={baseCard} visible={true} />)
    expect(screen.getByText('$1.49')).toBeInTheDocument()
  })

  it('does not render price line when not available', () => {
    const noPrice: DeckCard = { ...baseCard, price_ck: undefined }
    render(<CardTooltip card={noPrice} visible={true} />)
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
  })

  it('renders hint text', () => {
    render(<CardTooltip card={baseCard} visible={true} />)
    expect(screen.getByText(/Click to see pros, cons/)).toBeInTheDocument()
  })

  it('renders card art image when artUrl is provided', () => {
    render(
      <CardTooltip
        card={baseCard}
        artUrl="https://example.com/frog.jpg"
        visible={true}
      />
    )
    const img = screen.getByAltText('Spore Frog art')
    expect(img).toBeInTheDocument()
  })

  it('does not render card art when artUrl is not provided', () => {
    render(<CardTooltip card={baseCard} visible={true} />)
    expect(screen.queryByAltText('Spore Frog art')).not.toBeInTheDocument()
  })

  it('positions tooltip using anchorRect top value', () => {
    const { container } = render(
      <CardTooltip
        card={baseCard}
        visible={true}
        anchorRect={{ top: 120, left: 300 }}
      />
    )
    const tooltip = container.firstChild as HTMLElement
    expect(tooltip.style.top).toBe('120px')
  })

  it('positions tooltip to the left of panel (right: 100%)', () => {
    const { container } = render(
      <CardTooltip card={baseCard} visible={true} />
    )
    const tooltip = container.firstChild as HTMLElement
    expect(tooltip.style.right).toBe('100%')
  })
})
