/**
 * Generic basic lands on a deck: change count, edit the whole line (contract generic-basic-lands §3A, §6).
 *
 * A "line" is one basic type (card name) in one deck. Sleeved/Unsleeved, finish, language and art
 * always apply to the whole line. Nothing here touches a collection copy.
 */

import type { createAdminClient } from '@/lib/supabase'
import { isBasicLand, pickGenericArt } from '@/lib/basic-lands'

export type GenericClient = Pick<ReturnType<typeof createAdminClient>, 'from' | 'rpc'>

export class GenericBasicsError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'GenericBasicsError'
    this.status = status
  }
}

const FINISHES = ['nonfoil', 'foil', 'etched'] as const
type Finish = (typeof FINISHES)[number]

function asFinish(value: unknown): Finish | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value === 'string' && (FINISHES as readonly string[]).includes(value)) return value as Finish
  throw new GenericBasicsError('finish must be nonfoil, foil or etched', 400)
}

function asLanguage(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value === 'string' && /^[a-z]{2,4}$/.test(value.trim().toLowerCase())) return value.trim().toLowerCase()
  throw new GenericBasicsError('language must be a short language code', 400)
}

function requireBasicName(value: unknown): string {
  if (typeof value !== 'string' || !isBasicLand(value)) {
    throw new GenericBasicsError('cardName must be a basic land', 400)
  }
  return value
}

/** Art is image only: any printing of that basic is accepted, owned or not. */
async function checkArt(
  supabase: GenericClient,
  cardName: string,
  scryfallId: string
): Promise<{ setCode: string }> {
  const { data, error } = await supabase
    .from('ref_printings')
    .select('scryfall_id, name, set_code')
    .eq('scryfall_id', scryfallId)
    .maybeSingle()
  if (error) throw new GenericBasicsError(error.message, 500)
  if (!data || data.name !== cardName) {
    throw new GenericBasicsError(`That art is not a printing of ${cardName}`, 400)
  }
  return { setCode: data.set_code }
}

/** The printings of this basic the owner owns (for the random default art). */
export async function ownedBasicPrintings(
  supabase: GenericClient,
  userId: string,
  cardName: string
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('user_copies')
      .select('printing_id, user_cards!inner(card_name)')
      .eq('user_id', userId)
      .eq('user_cards.card_name', cardName)
    return ((data ?? []) as unknown as Array<{ printing_id: string | null }>)
      .map((r) => r.printing_id)
      .filter((v): v is string => Boolean(v))
  } catch {
    return []
  }
}

export interface SetCountInput {
  deckId: number
  userId: string
  cardName: unknown
  count: unknown
  finish?: unknown
  language?: unknown
  scryfallId?: unknown
  random?: () => number
}

/**
 * Add, lower or remove generics of one basic type with one atomic RPC. New rows inherit the line's
 * state, finish, language and art; an empty line starts Sleeved with the given (or default stored) art.
 */
export async function setGenericBasicCount(supabase: GenericClient, input: SetCountInput) {
  const cardName = requireBasicName(input.cardName)
  if (typeof input.count !== 'number' || !Number.isInteger(input.count) || input.count < 0) {
    throw new GenericBasicsError('count must be a whole number, 0 or more', 400)
  }
  const finish = asFinish(input.finish)
  const language = asLanguage(input.language)

  let scryfallId: string | null = null
  let setCode: string | null = null
  if (typeof input.scryfallId === 'string' && input.scryfallId) {
    scryfallId = input.scryfallId
    setCode = (await checkArt(supabase, cardName, scryfallId)).setCode
  } else {
    // Default art: a random owned printing, else the Round 12 default. Stored, never recomputed.
    const owned = await ownedBasicPrintings(supabase, input.userId, cardName)
    scryfallId = pickGenericArt(cardName, owned, input.random) ?? null
    if (scryfallId) {
      const { data } = await supabase
        .from('ref_printings')
        .select('set_code')
        .eq('scryfall_id', scryfallId)
        .maybeSingle()
      setCode = data?.set_code ?? null
    }
  }

  // set_generic_basic_count comes from the second (not yet applied) migration, so it is not in the generated types yet.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)('set_generic_basic_count', {
    p_deck_id: input.deckId,
    p_user_id: input.userId,
    p_card_name: cardName,
    p_count: input.count,
    p_finish: finish ?? undefined,
    p_language: language ?? undefined,
    p_scryfall_id: scryfallId ?? undefined,
    p_set_code: setCode ?? undefined,
  })
  if (error) {
    if (error.message?.includes('deck_not_found')) throw new GenericBasicsError('Deck not found', 404)
    if (/invalid_generic|invalid_row/.test(error.message ?? '')) throw new GenericBasicsError('Invalid request', 400)
    throw new GenericBasicsError(error.message ?? 'Generic basics update failed', 500)
  }
  return data
}

export interface LinePatchInput {
  deckId: number
  userId: string
  cardName: unknown
  sleeved?: unknown
  finish?: unknown
  language?: unknown
  scryfallId?: unknown
  /** Anything else the client sent; rejected so copy fields cannot be smuggled in. */
  extra?: Record<string, unknown>
}

const FORBIDDEN_KEYS = ['is_generic', 'generic_sleeved', 'copy_id', 'ownership_status', 'scryfall_id', 'set_code']

/**
 * Sleeve, unsleeve or edit the whole generic line (one basic type in one deck) in one user-scoped
 * statement. Never creates, links or releases a copy.
 */
export async function updateGenericLine(supabase: GenericClient, input: LinePatchInput) {
  const cardName = requireBasicName(input.cardName)
  if (input.extra) {
    for (const key of FORBIDDEN_KEYS) {
      if (key in input.extra) throw new GenericBasicsError(`${key} cannot be set here`, 400)
    }
  }
  const update: {
    generic_sleeved?: boolean
    requested_finish?: string | null
    requested_language?: string | null
    scryfall_id?: string
    set_code?: string
  } = {}
  if (input.sleeved !== undefined) {
    if (typeof input.sleeved !== 'boolean') throw new GenericBasicsError('sleeved must be true or false', 400)
    update.generic_sleeved = input.sleeved
  }
  const finish = asFinish(input.finish)
  if (finish !== undefined) update.requested_finish = finish
  const language = asLanguage(input.language)
  if (language !== undefined) update.requested_language = language
  if (input.scryfallId !== undefined) {
    if (typeof input.scryfallId !== 'string' || !input.scryfallId) {
      throw new GenericBasicsError('scryfallId must be a printing id', 400)
    }
    const art = await checkArt(supabase, cardName, input.scryfallId)
    update.scryfall_id = input.scryfallId
    update.set_code = art.setCode
  }
  if (Object.keys(update).length === 0) throw new GenericBasicsError('Nothing to update', 400)

  const { data, error } = await supabase
    .from('deck_cards')
    .update(update)
    .eq('deck_id', input.deckId)
    .eq('user_id', input.userId)
    .eq('is_generic', true)
    .eq('card_name', cardName)
    .select('id')
  if (error) throw new GenericBasicsError(error.message, 500)
  if (!data || data.length === 0) throw new GenericBasicsError('Generic line not found', 404)
  return { updated: data.length }
}
