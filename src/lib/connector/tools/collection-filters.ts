// CC-07: the filters shared by search_collection and get_collection_summary. Contract: connector-collection-search.md sections 5 and 12 to 13.
// Filters the database can do are pushed into the view query; the rest (OR logic) is applied in the app after the read.
import type { z } from 'zod'
import type { ReadQuery } from '../user-client'
import { escapeLike } from './common'

export interface CollectionFilters {
  query?: string
  only_free?: boolean
  include_proxies?: boolean
  only_proxies?: boolean
}

/** Filters that need no card facts, so they also apply to cards that have none. */
export function applyPushdown(q: ReadQuery, f: CollectionFilters): ReadQuery {
  let out = q
  if (f.query) out = out.ilike('card_name', `%${escapeLike(f.query)}%`)
  if (f.only_free) out = out.eq('is_free', true)
  if (f.only_proxies) out = out.eq('is_proxy', true)
  else if (f.include_proxies === false) out = out.eq('is_proxy', false)
  return out
}

/** Cross-field rules. Used as a zod superRefine, so a bad mix is INVALID_INPUT before any read happens. */
export function refineFilters(f: CollectionFilters, ctx: z.RefinementCtx): void {
  if (f.only_proxies && f.include_proxies === false) {
    ctx.addIssue({ code: 'custom', path: ['only_proxies'], message: 'only_proxies cannot be combined with include_proxies=false' })
  }
}
