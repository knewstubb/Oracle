import { describe, it, expect } from 'vitest'
import { decideDeckDialogClose } from './import-close-guard'

const idle = { checking: false, saving: false, hasEdits: false }

describe('decideDeckDialogClose', () => {
  it('never closes on an outside click', () => {
    expect(decideDeckDialogClose('outside-press', idle)).toBe('block')
  })
  it('blocks everything while saving', () => {
    expect(decideDeckDialogClose('escape-key', { ...idle, saving: true })).toBe('block')
    expect(decideDeckDialogClose('close-press', { ...idle, saving: true })).toBe('block')
  })
  it('blocks Escape while reading the file but lets X stop it', () => {
    expect(decideDeckDialogClose('escape-key', { ...idle, checking: true })).toBe('block')
    expect(decideDeckDialogClose('close-press', { ...idle, checking: true })).toBe('allow')
  })
  it('asks first when there are edits', () => {
    expect(decideDeckDialogClose('escape-key', { ...idle, hasEdits: true })).toBe('confirm')
  })
  it('allows closing otherwise', () => {
    expect(decideDeckDialogClose('escape-key', idle)).toBe('allow')
  })
})
