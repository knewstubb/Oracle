import { describe, it, expect } from 'vitest'
import { detectSourceTag } from './csv-normalizer'

describe('detectSourceTag', () => {
  it('returns "archidekt" for Archidekt headers', () => {
    const headers = ['Quantity', 'Card Name', 'Edition Code', 'Scryfall ID', 'Finish', 'Condition', 'Color identities', 'Card types']
    expect(detectSourceTag(headers)).toBe('archidekt')
  })

  it('returns "moxfield" for Moxfield headers', () => {
    const headers = ['Count', 'Tradelist Count', 'Name', 'Edition', 'Collector Number', 'Alter', 'Proxy', 'Foil', 'Condition']
    expect(detectSourceTag(headers)).toBe('moxfield')
  })

  it('returns "manabox" for ManaBox headers', () => {
    const headers = ['ManaBox ID', 'Scryfall ID', 'Name', 'Set code', 'Set name', 'Collector number', 'Foil', 'Quantity', 'Language']
    expect(detectSourceTag(headers)).toBe('manabox')
  })

  it('returns "manual" for unrecognized headers', () => {
    const headers = ['Name', 'Quantity', 'Notes']
    expect(detectSourceTag(headers)).toBe('manual')
  })

  it('returns "manual" for empty headers', () => {
    expect(detectSourceTag([])).toBe('manual')
  })
})
