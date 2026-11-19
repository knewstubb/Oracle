// The Strategy window's stored fields and the rules around them (DV-02). One place for limits, wording and the
// "Claude adds a dated paragraph, never replaces" rule, so the window, the page route and the connector agree.
import { parseBracket } from './deck-bracket'
export const SUMMARY_MAX = 120
export const STRATEGY_MAX = 4000 // equal to AI_LIMITS_NEW.strategy_notes_max_chars (a test keeps them equal)
export const PLAYGROUP_MAX = 500
export interface StrategyWindowData {
  /** False when the deck has no saved strategy row yet. */
  configured: boolean
  bracket: number | null
  summary: string
  strategy: string
  playgroup: string
  /** 'owner' | 'claude' | null (null when never saved, or when the database cannot say yet). */
  updatedBy: 'owner' | 'claude' | null
  updatedAt: string | null
  /** False until the owner applies the stored-data change: the summary and "last changed by" cannot be saved yet. */
  canStoreNewFields: boolean
  /** What the cards imply, from a bracket check (RQ-14). Null today: nothing is counted yet. */
  implied: ImpliedBracket | null
}
export interface ImpliedBracket {
  /** The lowest bracket the cards prove. Cards can only prove a minimum. */
  minimumBracket: number
  /** What the check found, in words, for example "4 Game Changers". */
  basedOn: string
}
/** The warning, or null. Shown only when the cards imply a HIGHER bracket than the target. Informs; restricts nothing. */
export function bracketWarning(target: number | null, implied: ImpliedBracket | null): { text: string; basedOn: string } | null {
  if (target === null || !implied) return null
  const min = parseBracket(implied.minimumBracket)
  if (min === null || min <= target) return null
  return { text: `Cards in this deck imply at least Bracket ${min}. Your target is Bracket ${target}.`, basedOn: implied.basedOn }
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "19 Nov 2026" (UTC). */
export function longDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
/** "19 Nov" for the window footer. Empty string when the value is not a date. */
export function shortDateText(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
/**
 * Claude adds to the owner's Strategy text; it never replaces it. The owner's text stays exactly as written and a dated
 * paragraph goes after it. Returns null when the paragraph is empty or the result would be over the limit.
 */
export function addDatedParagraph(current: string | null | undefined, paragraph: string, today: Date): string | null {
  const add = paragraph.trim()
  if (!add) return null
  const base = current ?? ''
  const line = `Claude, ${longDate(today)}: ${add}`
  const next = base.trim() === '' ? line : `${base.replace(/\s+$/, '')}\n\n${line}`
  return next.length > STRATEGY_MAX ? null : next
}
/** Cleans what the window sends. Returns an error in plain words, or the values to store. */
export function validateWindowInput(body: unknown):
  | { ok: true; values: { bracket?: number | null; summary?: string | null; strategy?: string | null; playgroup?: string | null } }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Nothing to save.' }
  const b = body as Record<string, unknown>
  const values: { bracket?: number | null; summary?: string | null; strategy?: string | null; playgroup?: string | null } = {}
  if ('bracket' in b) {
    if (b.bracket === null) values.bracket = null
    else {
      const n = parseBracket(b.bracket)
      if (n === null) return { ok: false, error: 'The target bracket must be 1 to 5.' }
      values.bracket = n
    }
  }
  const text = (key: 'summary' | 'strategy' | 'playgroup', max: number, label: string): string | null => {
    if (!(key in b)) return null
    const v = b[key]
    if (v !== null && typeof v !== 'string') return `${label} must be text.`
    // The summary and playgroup are single lines; the Strategy keeps its line breaks.
    const s = typeof v === 'string' ? (key === 'strategy' ? v : v.replace(/\s*[\r\n]+\s*/g, ' ').trim()) : ''
    if (s.length > max) return `${label} can be at most ${max} characters.`
    values[key] = s === '' ? null : s
    return null
  }
  const err = text('summary', SUMMARY_MAX, 'The summary') ?? text('strategy', STRATEGY_MAX, 'The Strategy') ?? text('playgroup', PLAYGROUP_MAX, 'The playgroup')
  if (err) return { ok: false, error: err }
  if (Object.keys(values).length === 0) return { ok: false, error: 'Nothing to save.' }
  return { ok: true, values }
}
