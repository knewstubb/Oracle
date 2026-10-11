/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  opts: [] as Array<{ scryfallId?: string | null; cardName: string }>,
}))

vi.mock('@/components/CardHoverPreview', () => ({
  useCardHoverPreview: (opts: { scryfallId?: string | null; cardName: string }) => {
    h.opts.push(opts)
    return { triggerProps: {} }
  },
  usePartnerHoverPreview: () => ({
    triggerProps: {},
    scryfallId1: 'partner-id-1',
    scryfallId2: 'partner-id-2',
  }),
  getCardInfo: vi.fn(async () => ({ scryfallId: 'name-resolved-id', canBeCommander: false })),
}))

import { CardHoverLink, renderInlineContent } from '../render-card-links'

describe('CardHoverLink known printing', () => {
  beforeEach(() => {
    h.opts = []
  })

  it('passes a known printing to the hover preview instead of resolving by name', () => {
    render(<CardHoverLink cardName="Sol Ring" scryfallId="owned-printing-id" />)

    expect(h.opts.some((opts) => opts.scryfallId === 'owned-printing-id')).toBe(true)
    expect(h.opts.some((opts) => opts.scryfallId === 'name-resolved-id')).toBe(false)
  })

  it('falls back to the name-resolved printing when none is known', async () => {
    render(<CardHoverLink cardName="Sol Ring" />)

    await waitFor(() => {
      expect(h.opts.at(-1)?.scryfallId).toBe('name-resolved-id')
    })
  })

  it('threads a printing lookup through renderInlineContent', () => {
    const printingLookup = vi.fn((name: string) =>
      name === 'Sol Ring' ? 'looked-up-printing-id' : null
    )

    render(
      <div>
        {renderInlineContent('Try [[Sol Ring]] now', 'none', undefined, undefined, undefined, printingLookup)}
      </div>
    )

    expect(printingLookup).toHaveBeenCalledWith('Sol Ring')
    expect(h.opts.some((opts) => opts.scryfallId === 'looked-up-printing-id')).toBe(true)
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
  })
})
