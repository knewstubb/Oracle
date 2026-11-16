// Plain-words sentences for Claude's changes (spec docs/oracle/specs/claude-connector.md sections 4 and 5). Pure
// functions of the log / pending rows: no network, no hidden clock. The UI shows these strings and never writes its own.
import type { ChangeLogRow, MovedSlot, PendingRow, UndoRefusal } from './write-types'

const TZ = 'Pacific/Auckland'

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: TZ })
}

export function clockTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export interface GroupSentence {
  summary: string
  consequence: string | null
}

/** One request = one group of log rows. `rows` must be non-empty and share a group_id. */
export function describeGroup(rows: ChangeLogRow[]): GroupSentence {
  const first = rows[0]
  const n = rows.length
  const card = first.card_name
  const deck = first.deck_name ?? 'the deck'
  const many = n > 1
  switch (first.kind) {
    case 'deck_add':
      return many
        ? { summary: `Added ${n} cards to ${deck}.`, consequence: 'They are on the list, Unsleeved. No copies were moved.' }
        : { summary: `Added ${card} to ${deck}.`, consequence: 'It is on the list, Unsleeved. No copy was moved.' }
    case 'deck_remove':
      return many
        ? { summary: `Cut ${n} cards from ${deck}.`, consequence: 'Any copies went back to storage; they are still in your collection.' }
        : { summary: `Took ${card} out of ${deck}'s main list.`, consequence: 'The copy went back to storage; it is still in your collection.' }
    case 'deck_zone': {
      const toMaybe = (first as ChangeLogRow & { zone_to?: string }).zone_to !== 'main'
      if (toMaybe) {
        return many
          ? { summary: `Moved ${n} cards to ${deck}'s maybeboard.`, consequence: 'Any copies went back to storage.' }
          : { summary: `Moved ${card} to ${deck}'s maybeboard.`, consequence: 'The copy went back to storage.' }
      }
      return many
        ? { summary: `Moved ${n} cards from ${deck}'s maybeboard to its main list.`, consequence: 'They are on the list, Unsleeved.' }
        : { summary: `Moved ${card} from ${deck}'s maybeboard to its main list.`, consequence: 'It is on the list, Unsleeved.' }
    }
    case 'make_original':
      return { summary: `Marked your ${card} in ${deck} as an Original (it was a Proxy).`, consequence: 'The proxy went back to storage.' }
    case 'create_proxy':
      return { summary: `Made a proxy of ${card} for ${deck}.`, consequence: 'The proxy is a new copy in your collection, marked as a Proxy.' }
    case 'collection_add':
      return { summary: `Added ${card} to your collection (1 copy, in Unsorted).`, consequence: null }
    case 'sleeve_copy':
      return { summary: `Put a free copy of ${card} into ${deck}.`, consequence: null }
    case 'copy_move': {
      const to = first.other_deck_name ?? 'another deck'
      const at = clockTime(first.created_at)
      return {
        summary: `Moved ${card} from ${deck} to ${to}. You approved this${at ? ` at ${at}` : ''}.`,
        consequence: `${deck} still has the slot, now empty and planned.`,
      }
    }
    default:
      return { summary: `Changed ${card}.`, consequence: null }
  }
}

function when(on: string | null | undefined): string {
  const d = shortDate(on)
  return d ? ` on ${d}` : ''
}

/** Why an Undo was refused. Always specific; never only "not allowed". */
export function undoRefusalText(r: UndoRefusal): string {
  const card = r.card ?? 'That card'
  const deck = r.deck ?? 'the deck'
  const w = when(r.on)
  const tail = ' You can take it out by hand on the deck page.'
  switch (r.code) {
    case 'owner_only':
      return `Only you can undo this kind of change, so Claude can't. Use Undo in Oracle.`
    case 'window_closed':
      return `Can't undo this one. It is older than 7 days.`
    case 'already_undone':
      return `This change was already undone.`
    case 'slot_sleeved':
      return `Can't undo this one. ${card} was sleeved with a copy${w}. Undoing it now could break ${deck}.${tail}`
    case 'slot_edited':
      return `Can't undo this one. ${card} in ${deck} was changed${w}. Undoing it now could break the deck.${tail}`
    case 'slot_gone':
      return `Can't undo this one. ${card} is no longer on ${deck}'s list${w}.`
    case 'slot_changed':
      return `Can't undo this one. ${card} in ${deck} was changed${w}.${tail}`
    case 'deck_gone':
      return `Can't undo this one. ${deck} no longer exists.`
    case 'card_back_on_list':
      return `Can't undo this one. ${card} is on ${deck}'s list again${w}.`
    case 'copy_gone':
      return `Can't undo this one. The copy of ${card} is no longer in your collection.`
    case 'copy_elsewhere':
      return `Can't undo this one. The copy of ${card} was put in ${deck}${w}.`
    case 'copy_moved':
      return `Can't undo this one. The copy of ${card} was moved${w}${r.deck ? ` (it is in ${r.deck})` : ''}.`
    case 'copy_in_deck':
      return `Can't undo this one. The copy of ${card} is now in ${deck}${w}. Take it out of the deck first.`
    case 'copy_changed':
      return `Can't undo this one. The copy of ${card} was changed${w}.`
    case 'proxy_moved':
      return `Can't undo this one. The proxy of ${card} was moved${w}.`
    case 'copy_moved_again':
      return `Can't undo this one. ${card} was moved again${w}${r.deck ? ` (it is in ${r.deck})` : ''}.`
    case 'source_slot_gone':
      return `Can't undo this one. ${card}'s old slot in ${deck} is gone.`
    case 'source_slot_filled':
      return `Can't undo this one. ${card}'s old slot in ${deck} has a copy now${w}.`
    case 'group_too_big':
      return `Claude can only undo changes of 10 cards or fewer. Use Undo in Oracle.`
    default:
      return `Can't undo this one. Something changed since. Nothing was changed.`
  }
}

type FailureReason = { code?: string; card?: string; deck?: string; on?: string | null } | null | undefined

/** Why an approval could not be applied (the deck changed since Claude asked). */
export function staleText(f: FailureReason): string {
  const card = f?.card ?? 'The card'
  const deck = f?.deck ?? 'the deck'
  switch (f?.code) {
    case 'copy_not_in_a_deck':
    case 'source_changed':
      return `${card} is no longer where it was when Claude asked`
    case 'no_open_slot':
      return `${deck} has no open slot for ${card}`
    case 'copy_already_in_deck':
    case 'already_in_this_deck':
      return `${card} is already in ${deck}`
    case 'deck_not_found':
      return `${deck} no longer exists`
    case 'slot_not_found':
      return `A card on the list is gone`
    case 'copy_missing':
      return `The copy of ${card} is marked missing`
    case 'connection_ended':
      return `Claude's connection was switched off`
    default:
      return `The deck changed since Claude asked`
  }
}

export function pendingTitle(p: Pick<PendingRow, 'action' | 'card_count' | 'deck_name' | 'other_deck_name' | 'preview'>): string {
  const deck = p.deck_name ?? 'the deck'
  const n = p.card_count
  const cardWord = plural(n, 'card', 'cards')
  const first = p.preview?.cards?.[0]?.name ?? 'the card'
  switch (p.action) {
    case 'copy_move':
      return `Move ${first} from ${deck} to ${p.other_deck_name ?? 'another deck'}?`
    case 'deck_add':
      return `Add ${n} ${cardWord} to ${deck}?`
    case 'deck_remove':
      return `Cut ${n} ${cardWord} from ${deck}?`
    case 'deck_zone':
      return `Move ${n} ${cardWord} in ${deck}?`
    default:
      return `Change ${n} ${cardWord} in ${deck}?`
  }
}

export function pendingSummary(p: Pick<PendingRow, 'action' | 'card_count' | 'deck_name' | 'other_deck_name' | 'preview' | 'client_name'>): string {
  const who = p.client_name || 'Claude'
  const t = pendingTitle(p).replace(/\?$/, '')
  if (p.action === 'copy_move') return `${who} wants to ${t.charAt(0).toLowerCase()}${t.slice(1)}. Nothing has moved yet.`
  const extra = p.action === 'deck_remove' ? ' The copies go back to storage, not deleted.' : ''
  return `${who} wants to ${t.charAt(0).toLowerCase()}${t.slice(1)}. Nothing has changed yet.${extra}`
}

export function pendingEndedText(p: Pick<PendingRow, 'status' | 'failure_reason' | 'cancel_reason' | 'decided_at' | 'expires_at'>): string | null {
  switch (p.status) {
    case 'expired':
      return 'Expired. Nobody answered within 24 hours. Nothing changed.'
    case 'cancelled':
      return p.cancel_reason === 'switched_off' ? 'Cancelled. You switched the connection off. Nothing changed.' : 'Cancelled. The connection ended. Nothing changed.'
    case 'failed':
      return `Couldn't apply. ${staleText(p.failure_reason)}. Nothing was changed. Ask Claude again.`
    case 'declined':
      return 'You said no. Nothing changed.'
    default:
      return null
  }
}

export function movedSlotSentence(m: Pick<MovedSlot, 'card_name' | 'moved_to_deck_name' | 'at' | 'approved_by_owner'>): string {
  const d = shortDate(m.at)
  return `${m.card_name} was moved to ${m.moved_to_deck_name}${d ? ` on ${d}` : ''}${m.approved_by_owner ? ' (you approved it)' : ''}. This slot is empty and planned.`
}

/** Tool-facing wording for specific database refusals (shown to Claude, so it can tell the owner what happened). */
export function editErrorMessage(code: string, d: Record<string, unknown>): string {
  const card = typeof d.card === 'string' ? d.card : 'that card'
  const deck = typeof d.deck === 'string' ? d.deck : 'that deck'
  switch (code) {
    case 'connection_revoked':
      return 'This connection was switched off in Oracle. Nothing was changed.'
    case 'deck_not_found':
      return 'No deck with that id in your Oracle. Nothing was changed.'
    case 'slot_not_found':
      return `A card slot you named is not in ${deck}. Nothing was changed.`
    case 'wrong_card':
      return `The slot does not hold ${card}. Nothing was changed.`
    case 'duplicate_slot':
      return 'The same slot was listed twice. Nothing was changed.'
    case 'too_many_cards':
      return `That is more than 60 cards in one request. Send a smaller request. Nothing was changed.`
    case 'too_many_waiting':
      return 'There are already 20 requests waiting for the owner. Nothing was changed. Ask the owner to answer those first.'
    case 'commander_slot':
    case 'commander_copy':
      return `${card} is a commander. Changing commanders is not allowed here. Nothing was changed.`
    case 'copy_not_found':
      return 'That copy is not in the owner\'s collection. Nothing was changed.'
    case 'copy_missing':
      return `The copy of ${card} is marked missing. Nothing was changed.`
    case 'copy_not_in_a_deck':
      return `The copy of ${card} is not in a deck right now. Nothing was changed.`
    case 'copy_already_in_deck':
      return `That copy is already in a deck (${deck}). Nothing was changed.`
    case 'already_in_this_deck':
      return `${card} is already in ${deck}. Nothing was changed.`
    case 'slot_already_sleeved':
      return `The slot for ${card} already has a copy. Nothing was changed.`
    case 'slot_not_a_proxy':
      return `The slot for ${card} is not a proxy. Nothing was changed.`
    case 'replacement_is_proxy':
      return 'The replacement copy is itself a proxy. Nothing was changed.'
    case 'no_open_slot':
      return `${deck} has no open slot for ${card}. Nothing was changed.`
    case 'no_card_record':
      return `${card} is not in the owner's collection, so a proxy can't be made. Nothing was changed.`
    case 'already_there':
      return `${card} is already there. Nothing was changed.`
    case 'source_changed':
      return `${card} is no longer where it was. Nothing was changed.`
    case 'change_not_found':
      return 'No change with that id in the owner\'s record. Nothing was changed.'
    case 'pending_not_found':
      return 'No request with that id from this connection.'
    case 'invalid_request':
      return `Something in the request is not valid${typeof d.field === 'string' ? ` (${d.field})` : ''}. Nothing was changed.`
    default:
      return 'Oracle could not make that change. Nothing was changed.'
  }
}
