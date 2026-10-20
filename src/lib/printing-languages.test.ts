import { describe, it, expect, vi } from 'vitest'
import {
  buildPrintingLanguageUrl,
  languagesFromScryfall,
  fetchPrintingLanguages,
  languageChoices,
} from './printing-languages'

describe('buildPrintingLanguageUrl', () => {
  it('asks for every language of one printing', () => {
    const url = buildPrintingLanguageUrl(' SOS ', '333')
    expect(url).toContain('unique=prints')
    expect(url).toContain('include_multilingual=true')
    expect(decodeURIComponent(url)).toContain('set:sos cn:"333"')
  })
})

describe('languagesFromScryfall', () => {
  it('de-duplicates, lower-cases and puts English first', () => {
    expect(languagesFromScryfall({ data: [{ lang: 'ja' }, { lang: 'EN' }, { lang: 'de' }, { lang: 'ja' }] })).toEqual([
      'en',
      'de',
      'ja',
    ])
  })
  it('returns [] for anything else', () => {
    expect(languagesFromScryfall(null)).toEqual([])
    expect(languagesFromScryfall({ data: 'x' })).toEqual([])
  })
})

describe('fetchPrintingLanguages', () => {
  const ok = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
  it('returns the languages', async () => {
    expect(await fetchPrintingLanguages('sos', '333', ok({ data: [{ lang: 'en' }, { lang: 'fr' }] }))).toEqual(['en', 'fr'])
  })
  it('treats 404 as no known prints', async () => {
    expect(await fetchPrintingLanguages('sos', '999', ok({}, 404))).toEqual([])
  })
  it('returns null on a server error or a network failure', async () => {
    expect(await fetchPrintingLanguages('sos', '1', ok({}, 500))).toBeNull()
    expect(await fetchPrintingLanguages('sos', '1', vi.fn().mockRejectedValue(new Error('down')))).toBeNull()
  })
})

describe('languageChoices', () => {
  it('shows a loading state while waiting, keeping the file value', () => {
    expect(languageChoices({ status: 'loading' }, ['ja'], 'ja')).toEqual({ mode: 'loading', codes: ['ja'] })
  })
  it('lists Scryfall languages and always keeps the file value', () => {
    const r = languageChoices({ status: 'done', languages: ['en', 'de'] }, ['ja'], 'ja')
    expect(r.mode).toBe('select')
    expect(r.codes).toEqual(['en', 'de', 'ja'])
  })
  it('hides the control when there is only one language', () => {
    expect(languageChoices({ status: 'done', languages: ['en'] }, ['en'], 'en').mode).toBe('hidden')
  })
  it('fails safe to the languages in the file when the lookup failed', () => {
    const r = languageChoices({ status: 'done', languages: null }, ['en', 'ja'], 'en')
    expect(r).toEqual({ mode: 'select', codes: ['en', 'ja'] })
  })
  it('keeps an owner-picked value selectable', () => {
    expect(languageChoices({ status: 'done', languages: ['en', 'de'] }, ['en'], 'fr').codes).toContain('fr')
  })
})
