import { describe, it, expect } from 'vitest'
import {
  previewImageSources,
  nextPreviewSource,
  previewKey,
  shouldShowPreview,
} from '../card-preview-image'

const ID = 'abcd1234-0000-0000-0000-000000000000'

describe('previewImageSources', () => {
  it('with an id: CDN, then API by id, then name lookup', () => {
    expect(previewImageSources(ID, 'Sol Ring')).toEqual([
      `https://cards.scryfall.io/large/front/a/b/${ID}.jpg`,
      `https://api.scryfall.com/cards/${ID}?format=image&version=large`,
      'https://api.scryfall.com/cards/named?exact=Sol%20Ring&format=image&version=large',
    ])
  })

  it.each([null, undefined, '', '   '])('with id %j: name lookup only', (id) => {
    expect(previewImageSources(id, 'Sol Ring')).toEqual([
      'https://api.scryfall.com/cards/named?exact=Sol%20Ring&format=image&version=large',
    ])
  })

  it('encodes names with punctuation and double faces', () => {
    const [url] = previewImageSources(null, "Jace, Vryn's Prodigy // Jace")
    expect(url).toContain(encodeURIComponent("Jace, Vryn's Prodigy // Jace"))
  })

  it('no id and no name: nothing to try', () => {
    expect(previewImageSources(null, '  ')).toEqual([])
  })
})

describe('nextPreviewSource', () => {
  const s = ['a', 'b', 'c']
  it('walks the list then gives up', () => {
    expect(nextPreviewSource(s, 'a')).toBe('b')
    expect(nextPreviewSource(s, 'b')).toBe('c')
    expect(nextPreviewSource(s, 'c')).toBeNull()
  })
  it('unknown url gives up', () => {
    expect(nextPreviewSource(s, 'zzz')).toBeNull()
  })
})

describe('shouldShowPreview', () => {
  const k = previewKey('Sol Ring', ID)
  it('shows only when loaded and still the hovered row', () => {
    expect(shouldShowPreview(k, k, true)).toBe(true)
  })
  it('never shows an unloaded image (no blank popover)', () => {
    expect(shouldShowPreview(k, k, false)).toBe(false)
  })
  it('stays hidden after the pointer left (no hovered row)', () => {
    expect(shouldShowPreview(null, k, true)).toBe(false)
  })
  it('stays hidden when a late load belongs to a different row', () => {
    expect(shouldShowPreview(previewKey('Mountain', 'x'), k, true)).toBe(false)
    expect(shouldShowPreview(k, undefined, true)).toBe(false)
  })
  it('keys differ by printing, so two printings of one card do not collide', () => {
    expect(previewKey('Sol Ring', 'a')).not.toBe(previewKey('Sol Ring', 'b'))
  })
})
