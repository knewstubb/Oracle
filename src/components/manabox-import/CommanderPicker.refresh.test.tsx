import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CommanderPicker } from './CommanderPicker'
import { deckKeys } from '@/hooks/useDeckQueryKeys'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

afterEach(() => vi.unstubAllGlobals())

describe('CommanderPicker: choosing a commander refreshes the deck page data', () => {
  it('invalidates the same key the deck page reads (numeric deck id) and the legality banner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/eligible')
          ? { ok: true, json: async () => ({ eligible: ['Rocco, Cabaretti Caterer'] }) }
          : { ok: true, json: async () => ({ success: true }) }
      )
    )
    const qc = new QueryClient()
    qc.setQueryData(deckKeys.detail(7), { stale: true })
    qc.setQueryData(['deck-legality', '7'], { stale: true })
    render(
      <QueryClientProvider client={qc}>
        <CommanderPicker
          deckId={7}
          open
          onOpenChange={() => {}}
          cards={[{ card_name: 'Rocco, Cabaretti Caterer', scryfall_id: 's1' } as never]}
        />
      </QueryClientProvider>
    )
    fireEvent.click(await screen.findByRole('option', { name: /Rocco/ }))
    await waitFor(() => {
      expect(qc.getQueryState(deckKeys.detail(7))?.isInvalidated).toBe(true)
      expect(qc.getQueryState(['deck-legality', '7'])?.isInvalidated).toBe(true)
    })
  })
})

import { ChooseCommanderButton } from './CommanderPicker'

describe('ChooseCommanderButton opens on arrival (D-052)', () => {
  it('opens with the eligible cards listed when openOnMount is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ eligible: ['Rocco, Cabaretti Caterer'] }) }))
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ChooseCommanderButton
          deckId={7}
          openOnMount
          cards={[{ card_name: 'Rocco, Cabaretti Caterer', scryfall_id: 's1' } as never]}
        />
      </QueryClientProvider>
    )
    expect(await screen.findByRole('listbox', { name: 'Commander candidates' })).toBeTruthy()
    expect(await screen.findByRole('option', { name: /Rocco/ })).toBeTruthy()
  })
})
