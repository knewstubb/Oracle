import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CardGroupSection } from './CardGroupSection'
import { CARD_SURFACE_CLASS } from '@/lib/ui-tokens'

describe('CardGroupSection surface', () => {
  it('still renders its old class string and translucent background', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <CardGroupSection groupName="Artifact" groupCards={[]} statusMap={new Map()} lifecycleMap={new Map()} deckId={4} physicalCopyMap={new Map()} />
      </QueryClientProvider>,
    )
    const section = container.querySelector('#category-artifact') as HTMLElement
    expect(section.getAttribute('class')).toBe('rounded-lg border border-white/[0.08]')
    expect(CARD_SURFACE_CLASS).toBe('rounded-lg border border-white/[0.08]')
    expect(section.getAttribute('style')).toBe('background-color: rgba(26, 26, 30, 0.5);')
  })
})
