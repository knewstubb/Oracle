/**
 * What the card window shows under "Roles (read-only for now)": the four roles the app works out today
 * from the card's text (the same function Deck health uses), decided in one place for the route and tests.
 *
 * - `no_data`: the card has no row (or no text) in the card reference table, so nothing was worked out.
 * - `land`: lands have no roles by rule.
 * - `roles`: the card was checked; the list may be empty ("checked, no role found").
 */
import { ROLE_ORDER, hasClassifiableText, isLandTypeLine, rolesForCard, type Role } from './card-roles'
import { isBasicLandCard } from './basic-lands'
import type { StoredRoles } from './card-window-stored-roles'
import { allCardTypes, parseTypeLine } from './type-line'

export type CardWindowRoles =
  | { kind: 'no_data' }
  | { kind: 'land' }
  | { kind: 'roles'; roles: Role[] }

export const WINDOW_ROLE_LABELS: Record<Role, string> = { ramp: 'Ramp', draw: 'Draw', removal: 'Removal', wipes: 'Wipes' }

export function cardWindowRoles(card: { name: string; typeLine: string | null; oracleText: string | null }): CardWindowRoles {
  if (card.typeLine ? isLandTypeLine(card.typeLine) : isBasicLandCard(card)) return { kind: 'land' }
  if (!hasClassifiableText(card)) return { kind: 'no_data' }
  const found = rolesForCard(card)
  return { kind: 'roles', roles: ROLE_ORDER.filter((r) => found.includes(r)) }
}

/** The card's type line split by the Magic rules: supertypes, card types (all of them, both faces), subtypes. */
export interface CardWindowTypes {
  supertypes: string[]
  cardTypes: string[]
  subtypes: string[]
}
/** What the roles route sends: the roles result plus the parsed type line from the same single lookup. */
export type CardWindowLookup = CardWindowRoles & { types?: CardWindowTypes; stored?: StoredRoles }
const unique = (xs: string[]) => [...new Set(xs)]
export function cardWindowTypes(typeLine: string | null | undefined): CardWindowTypes {
  const parsed = parseTypeLine(typeLine)
  return {
    supertypes: unique(parsed.faces.flatMap((f) => f.supertypes)),
    cardTypes: allCardTypes(parsed),
    subtypes: unique(parsed.faces.flatMap((f) => f.subtypes)),
  }
}
