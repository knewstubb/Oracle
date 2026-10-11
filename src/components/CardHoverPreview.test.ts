/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getScryfallId } from './CardHoverPreview'

describe('getScryfallId', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a known printing id without resolving the newest printing by name', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      getScryfallId('Known Printing Card', 'known-printing-id')
    ).resolves.toBe('known-printing-id')

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('resolves by name when no printing is known', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ scryfall_id: 'name-resolved-printing-id' }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      getScryfallId('Card Without Known Printing')
    ).resolves.toBe('name-resolved-printing-id')

    expect(String(fetchSpy.mock.calls[0][0])).toContain('action=scryfall_id')
  })
})
