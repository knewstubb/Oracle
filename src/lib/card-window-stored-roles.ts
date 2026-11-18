/**
 * Universal roles in the card window (card roles and deck jobs, slice 2).
 *
 * Three layers (contract section 4): the shared baseline, the owner's own changes on top, and Claude's proposals
 * (slice 3, not written yet). The database function get_effective_card_roles does that merge; this file only
 * (a) mirrors the contract's role list and wording, (b) folds in today's text-reading stand-in for roles nothing
 * stored speaks about, and (c) works out what the owner's click on a chip means.
 *
 * Roles are keyed by oracle_id (the card), never scryfall_id (a printing). D-003.
 */
import type { EffectiveCardRole, OwnerRoleAction, RoleSlug as ContractRoleSlug } from '../../docs/oracle/contracts/card-roles-and-deck-jobs.types'
import type { Role } from './card-roles'
import type { CardWindowRoles } from './card-window-roles'

export type RoleSlug = ContractRoleSlug
export type { OwnerRoleAction }

/** The 13 roles, in display order. A test asserts this equals the contract's list. */
export const ROLE_SLUGS: readonly RoleSlug[] = [
  'ramp', 'fixing', 'card_draw', 'card_selection', 'tutor', 'targeted_removal', 'board_wipe',
  'counterspell', 'protection', 'recursion', 'graveyard_hate', 'stax_tax', 'hand_disruption',
]

/** The names on screen (spec 6.1). */
export const ROLE_SLUG_LABELS: Record<RoleSlug, string> = {
  ramp: 'Ramp',
  fixing: 'Fixing',
  card_draw: 'Card draw',
  card_selection: 'Card selection',
  tutor: 'Tutor',
  targeted_removal: 'Targeted removal',
  board_wipe: 'Board wipe',
  counterspell: 'Counterspell',
  protection: 'Protection',
  recursion: 'Recursion',
  graveyard_hate: 'Graveyard hate',
  stax_tax: 'Stax/tax',
  hand_disruption: 'Hand disruption',
}

/** Where a shown role comes from (spec 5.1). */
export type RoleSource = 'owner' | 'baseline' | 'claude' | 'text'
export const ROLE_SOURCE_LABELS: Record<RoleSource, string> = {
  owner: 'Set by you',
  baseline: 'Standard',
  claude: 'Proposed by Claude',
  text: 'Worked out from card text',
}

/** The four text-reading roles written as the contract's slugs (draw is Card draw, removal is Targeted removal, wipes is Board wipe). */
export const TEXT_ROLE_TO_SLUG: Record<Role, RoleSlug> = {
  ramp: 'ramp',
  draw: 'card_draw',
  removal: 'targeted_removal',
  wipes: 'board_wipe',
}

/** The part of get_effective_card_roles the window needs. */
export type StoredRoleRow = Pick<
  EffectiveCardRole,
  'role' | 'in_baseline' | 'owner_effect' | 'claude_effect' | 'claude_state' | 'effective' | 'effective_from' | 'beside'
>

/** What the roles route says about stored roles for one card. */
export type StoredRoles =
  | { status: 'ok'; oracleId: string; rows: StoredRoleRow[] }
  /** The card could not be matched to a card identity, so nothing can be saved for it. */
  | { status: 'no_identity' }
  /** The stored roles could not be read. Today's text reading still shows. */
  | { status: 'error' }

export interface RoleChip {
  role: RoleSlug
  label: string
  source: RoleSource
  /** Only for source 'claude': the owner has a different value that stays in force. Slice 3 fills this. */
  beside?: boolean
  /** What the chip's x does: 'remove' hides the role for you, 'clear' deletes your own add. */
  removeAction: Extract<OwnerRoleAction, 'remove' | 'clear'>
}

export interface WindowRoleView {
  chips: RoleChip[]
  /** Roles you removed (they show as "You removed: Ramp. Restore"). */
  removed: RoleSlug[]
  /** Roles you could add: every role not on the card now. */
  addable: RoleSlug[]
}

const order = (a: RoleSlug, b: RoleSlug) => ROLE_SLUGS.indexOf(a) - ROLE_SLUGS.indexOf(b)

/**
 * Combine the stored layers with the text reading.
 * Rule (open decision, flagged in the slice 2 report): a text-reading role shows only when no stored layer says
 * anything about that role. So a role you removed stays gone, and a role you added next to a text-read one leaves
 * the text-read one in place. A land gets no text-read roles, but may hold stored ones.
 */
export function mergeWindowRoles(stored: StoredRoles | undefined, standIn: CardWindowRoles): WindowRoleView {
  const rows = stored?.status === 'ok' ? stored.rows : []
  const spoken = new Set(rows.filter((r) => r.owner_effect != null || r.in_baseline || r.claude_state === 'to_look_at').map((r) => r.role))
  const chips: RoleChip[] = []
  const removed: RoleSlug[] = []
  for (const r of rows) {
    if (r.effective && r.effective_from) {
      chips.push({
        role: r.role,
        label: ROLE_SLUG_LABELS[r.role],
        source: r.effective_from,
        beside: r.effective_from === 'claude' && r.beside ? true : undefined,
        removeAction: r.owner_effect === 'add' && !r.in_baseline ? 'clear' : 'remove',
      })
    } else if (r.owner_effect === 'remove') {
      removed.push(r.role)
    }
  }
  if (standIn.kind === 'roles') {
    for (const t of standIn.roles) {
      const slug = TEXT_ROLE_TO_SLUG[t]
      if (!spoken.has(slug) && !chips.some((c) => c.role === slug)) {
        chips.push({ role: slug, label: ROLE_SLUG_LABELS[slug], source: 'text', removeAction: 'remove' })
      }
    }
  }
  chips.sort((a, b) => order(a.role, b.role))
  removed.sort(order)
  const shown = new Set(chips.map((c) => c.role))
  return { chips, removed, addable: ROLE_SLUGS.filter((s) => !shown.has(s)) }
}

/**
 * What the stored roles look like right after the owner's click, worked out on screen so the window can update at
 * once while the save runs. The saved answer replaces it as soon as it is read back.
 */
export function applyOwnerAction(stored: StoredRoles | undefined, role: RoleSlug, action: OwnerRoleAction): StoredRoles | undefined {
  if (stored?.status !== 'ok') return stored
  const blank: StoredRoleRow = { role, in_baseline: false, owner_effect: null, claude_effect: null, claude_state: null, effective: false, effective_from: null, beside: false }
  const old = stored.rows.find((r) => r.role === role) ?? blank
  const owner_effect = action === 'clear' ? null : action
  const effective = owner_effect === 'add' || (owner_effect === null && old.in_baseline)
  const effective_from: StoredRoleRow['effective_from'] = !effective ? null : owner_effect === 'add' && !old.in_baseline ? 'owner' : 'baseline'
  const next: StoredRoleRow = { ...old, owner_effect, effective, effective_from, beside: false }
  const rows = stored.rows.some((r) => r.role === role) ? stored.rows.map((r) => (r.role === role ? next : r)) : [...stored.rows, next]
  return { ...stored, rows }
}
