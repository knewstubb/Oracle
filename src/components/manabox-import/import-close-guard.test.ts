import { describe, it, expect } from 'vitest'
import { decideCollectionClose, decideDeckDialogClose } from './import-close-guard'

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

describe('decideCollectionClose', () => {
  const st = { checking: false, saving: false, hasEdits: false, finished: false }
  it('blocks outside click and Escape before the result', () => {
    expect(decideCollectionClose('outside-press', st)).toBe('block')
    expect(decideCollectionClose('escape-key', st)).toBe('block')
  })
  it('asks "Discard edits?" on Escape when the review has edits, like X', () => {
    expect(decideCollectionClose('escape-key', { ...st, hasEdits: true })).toBe('confirm')
    expect(decideCollectionClose('escape-key', { ...st, hasEdits: true, saving: true })).toBe('block')
    expect(decideCollectionClose('outside-press', { ...st, hasEdits: true })).toBe('block')
  })
  it('lets Escape close the result screen', () => {
    expect(decideCollectionClose('escape-key', { ...st, finished: true })).toBe('allow')
  })
  it('asks before X discards edits and blocks X while saving', () => {
    expect(decideCollectionClose('close-press', { ...st, hasEdits: true })).toBe('confirm')
    expect(decideCollectionClose('close-press', { ...st, saving: true })).toBe('block')
    expect(decideCollectionClose('close-press', st)).toBe('allow')
  })
})
