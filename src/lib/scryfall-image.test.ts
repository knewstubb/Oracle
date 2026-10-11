import { describe, it, expect } from 'vitest'
import { getScryfallImageUrl } from './scryfall-image'

describe('getScryfallImageUrl', () => {
  const id = 'abc12345-6789-0000-0000-000000000000'

  it('builds the normal CDN URL from a printing id', () => {
    expect(getScryfallImageUrl(id)).toBe(
      'https://cards.scryfall.io/normal/front/a/b/abc12345-6789-0000-0000-000000000000.jpg'
    )
  })

  it('builds art_crop and large URLs when a size is given', () => {
    expect(getScryfallImageUrl(id, 'art_crop')).toBe(
      'https://cards.scryfall.io/art_crop/front/a/b/abc12345-6789-0000-0000-000000000000.jpg'
    )
    expect(getScryfallImageUrl(id, 'large')).toBe(
      'https://cards.scryfall.io/large/front/a/b/abc12345-6789-0000-0000-000000000000.jpg'
    )
  })

  it('returns null when there is no id', () => {
    expect(getScryfallImageUrl(null)).toBeNull()
    expect(getScryfallImageUrl(undefined)).toBeNull()
    expect(getScryfallImageUrl('')).toBeNull()
  })
})
