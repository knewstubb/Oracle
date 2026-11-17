/**
 * All-decks Picklist: every planned card of every deck, plus the saved steps (move_items), laid out in walking order.
 * Contract: know-where-cards-are.md (GET /api/picklist) and spec section 4 / 20.5. Pure; the route does the reading.
 *
 * Rows come from two places:
 * - planned slots (deck_cards with no copy), derived on every load the same way a deck's own Picklist does it;
 * - saved steps (a tick creates one). An open step (to find, picked, missing) takes precedence for its slot, so that
 *   slot is not derived again. A placed step whose slot is planned again is dropped as history.
 *
 * Stops: storage (Unsorted first, then A to Z), another deck (A to Z), place in decks and boxes (A to Z),
 * and an Unowned section (one stop per deck, no ticks: there is no copy to pick).
 *
 * One copy, one row: a copy can have only one open step, so a free or claimed copy is handed to one planned slot only.
 * A later slot that wants the same copy (and has no other) is shown with `blockedBy` and no ticks, so a tick never
 * fails on a row that looked valid.
 */
import type { RankedCandidate } from '@/lib/allocation-candidates'

export interface WalkItem {
  id: number
  state: 'to_find' | 'found' | 'placed' | 'missing'
  copyId: number | null
  cardName: string
  isProxy: boolean
  fromDeckId: number | null
  fromLocationId: number | null
  toDeckId: number | null
  toDeckCardId: number | null
  toLocationId: number | null
}

/** A planned slot (deck_cards row with no copy, not a generic basic) and the ranked copies that could fill it. */
export interface PlannedSlot {
  deckId: number
  deckCardId: number
  cardName: string
  candidates: RankedCandidate[]
}

export interface WalkNames {
  decks: Map<number, string>
  /** locationId -> name and whether it is Unsorted */
  locations: Map<number, { name: string; isUnsorted: boolean }>
}

export interface WalkRow {
  /** The saved step, or null for a planned slot that has no step yet (the first tick creates it). */
  itemId: number | null
  /** Stable key for lists: the step id, or the slot. */
  key: string
  state: WalkItem['state']
  copyId: number | null
  cardName: string
  isProxy: boolean
  /** Where the card is taken from (null when the saved step has no source). */
  fromName: string | null
  /** Where it is going. */
  toName: string
  toDeckId: number | null
  toDeckCardId: number | null
  toLocationId: number | null
  /** Set when the only copy is already going to another row: the name of where it is going. No ticks. */
  blockedBy: string | null
}

export interface WalkStop { key: string; placeName: string; isUnsorted: boolean; rows: WalkRow[] }

export interface DeckProgress { deckId: number; deckName: string; placed: number; total: number }

export interface AllDecksPicklist {
  takeFromBoxes: WalkStop[]
  takeFromDecks: WalkStop[]
  placeIn: WalkStop[]
  /** Planned cards the owner does not own anywhere, one stop per deck. */
  unowned: WalkStop[]
  counts: { total: number; found: number; placed: number; missing: number; open: number; unowned: number }
  /** "N of M cards placed" per deck, counted over planned rows plus steps. */
  decks: DeckProgress[]
}

const byName = (a: { placeName: string }, b: { placeName: string }) => a.placeName.localeCompare(b.placeName)

export function buildAllDecksPicklist(items: readonly WalkItem[], names: WalkNames, planned: readonly PlannedSlot[] = []): AllDecksPicklist {
  const deckName = (id: number | null) => (id === null ? null : names.decks.get(id) ?? 'a deck')
  const loc = (id: number | null) => (id === null ? null : names.locations.get(id) ?? { name: 'a box', isUnsorted: false })
  const boxes = new Map<string, WalkStop>()
  const decks = new Map<string, WalkStop>()
  const places = new Map<string, WalkStop>()
  const unowned = new Map<string, WalkStop>()
  const progress = new Map<number, DeckProgress>()
  const add = (map: Map<string, WalkStop>, key: string, placeName: string, isUnsorted: boolean, row: WalkRow) => {
    const stop = map.get(key) ?? { key, placeName, isUnsorted, rows: [] }
    stop.rows.push(row)
    map.set(key, stop)
  }
  const tally = (deckId: number | null, placed: boolean) => {
    if (deckId === null) return
    const p = progress.get(deckId) ?? { deckId, deckName: deckName(deckId) as string, placed: 0, total: 0 }
    p.total += 1
    if (placed) p.placed += 1
    progress.set(deckId, p)
  }
  const counts = { total: 0, found: 0, placed: 0, missing: 0, open: 0, unowned: 0 }

  // Copies already in an open step (to_find or found) cannot be offered to another row; where they are going.
  const copyGoingTo = new Map<number, string>()
  const slotsWithSteps = new Set<number>()

  // A Placed step whose slot is planned again (the copy was released since) is history, not a current row.
  const plannedSlotIds = new Set(planned.map((s) => s.deckCardId))
  for (const i of items) {
    if (i.state === 'placed' && i.toDeckCardId !== null && plannedSlotIds.has(i.toDeckCardId)) continue
    const from = i.fromDeckId !== null ? { name: deckName(i.fromDeckId) as string, isUnsorted: false } : loc(i.fromLocationId)
    const to = i.toDeckId !== null ? (deckName(i.toDeckId) as string) : (loc(i.toLocationId)?.name ?? 'a box')
    if (i.toDeckCardId !== null && i.state !== 'placed') slotsWithSteps.add(i.toDeckCardId)
    if (i.copyId !== null && (i.state === 'to_find' || i.state === 'found')) copyGoingTo.set(i.copyId, to)
    const row: WalkRow = {
      itemId: i.id, key: `i${i.id}`, state: i.state, copyId: i.copyId, cardName: i.cardName, isProxy: i.isProxy,
      fromName: from?.name ?? null, toName: to, toDeckId: i.toDeckId, toDeckCardId: i.toDeckCardId, toLocationId: i.toLocationId,
      blockedBy: null,
    }
    counts.total += 1
    tally(i.toDeckId, i.state === 'placed')
    if (i.state === 'found') counts.found += 1
    else if (i.state === 'placed') counts.placed += 1
    else if (i.state === 'missing') counts.missing += 1
    else counts.open += 1
    if (i.state === 'found' || i.state === 'placed') {
      add(places, i.toDeckId !== null ? `d${i.toDeckId}` : `l${i.toLocationId}`, to, false, row)
    } else if (i.fromDeckId !== null) {
      add(decks, `d${i.fromDeckId}`, from!.name, false, row)
    } else if (i.fromLocationId !== null) {
      add(boxes, `l${i.fromLocationId}`, from!.name, from!.isUnsorted, row)
    } else {
      add(boxes, 'none', 'Unknown place', false, row)
    }
  }

  // Planned slots without a step, in a fixed order (deck A to Z, then card, then slot) so the same slot wins a
  // contested copy on every load.
  const slots = planned
    .filter((s) => !slotsWithSteps.has(s.deckCardId))
    .map((s) => ({ s, deck: deckName(s.deckId) as string }))
    .sort((a, b) => a.deck.localeCompare(b.deck) || a.s.cardName.localeCompare(b.s.cardName) || a.s.deckCardId - b.s.deckCardId)

  for (const { s, deck } of slots) {
    counts.total += 1
    tally(s.deckId, false)
    const base = {
      itemId: null, key: `s${s.deckCardId}`, state: 'to_find' as const, cardName: s.cardName,
      toName: deck, toDeckId: s.deckId, toDeckCardId: s.deckCardId, toLocationId: null,
    }
    // Same filter as the deck's own Picklist: a copy already in this deck is not a source for it.
    const owned = s.candidates.filter((c) => c.tier !== 5 && c.entry.physicalCopyId > 0 && (!c.entry.assignedTo || c.entry.assignedTo.deckId !== s.deckId))
    if (owned.length === 0) {
      counts.unowned += 1
      add(unowned, `d${s.deckId}`, deck, false, { ...base, copyId: null, isProxy: false, fromName: null, blockedBy: null })
      continue
    }
    counts.open += 1
    const free = owned.filter((c) => !c.entry.assignedTo)
    const claimed = owned.filter((c) => c.entry.assignedTo)
    const pick = free.find((c) => !copyGoingTo.has(c.entry.physicalCopyId)) ?? claimed.find((c) => !copyGoingTo.has(c.entry.physicalCopyId))
    const chosen = pick ?? free[0] ?? claimed[0]
    const blockedBy = pick ? null : copyGoingTo.get(chosen.entry.physicalCopyId) ?? 'another deck'
    if (pick) copyGoingTo.set(pick.entry.physicalCopyId, deck)
    const e = chosen.entry
    if (e.assignedTo) {
      add(decks, `d${e.assignedTo.deckId}`, e.assignedTo.deckName, false, {
        ...base, copyId: e.physicalCopyId, isProxy: e.isProxy, fromName: e.assignedTo.deckName, blockedBy,
      })
    } else {
      const l = e.locationId !== null ? names.locations.get(e.locationId) : undefined
      const placeName = l?.name ?? e.locationName ?? 'Unsorted'
      const isUnsorted = l ? l.isUnsorted : e.locationId === null || placeName === 'Unsorted'
      add(boxes, e.locationId !== null ? `l${e.locationId}` : 'unsorted', placeName, isUnsorted, {
        ...base, copyId: e.physicalCopyId, isProxy: e.isProxy, fromName: placeName, blockedBy,
      })
    }
  }

  const sort = (m: Map<string, WalkStop>, unsortedFirst: boolean) => {
    const list = [...m.values()]
    for (const s of list) s.rows.sort((a, b) => a.cardName.localeCompare(b.cardName) || a.toName.localeCompare(b.toName) || a.key.localeCompare(b.key))
    return list.sort((a, b) => (unsortedFirst && a.isUnsorted !== b.isUnsorted ? (a.isUnsorted ? -1 : 1) : byName(a, b)))
  }
  return {
    takeFromBoxes: sort(boxes, true),
    takeFromDecks: sort(decks, false),
    placeIn: sort(places, false),
    unowned: sort(unowned, false),
    counts,
    decks: [...progress.values()].sort((a, b) => a.deckName.localeCompare(b.deckName)),
  }
}

/** "N of M cards placed", singular when M is 1. */
export function placedSummary(placed: number, total: number): string {
  return `${placed} of ${total} card${total === 1 ? '' : 's'} placed`
}

/**
 * The number a row's optimistic save is keyed by: the step id, or minus the slot id for a planned row that has no
 * step yet (step ids are positive, so the two never collide).
 */
export function walkRowKey(row: Pick<WalkRow, 'itemId' | 'toDeckCardId'>): number {
  return row.itemId ?? -(row.toDeckCardId ?? 0)
}

/** A change shown at once on the all-decks Picklist, before the save answers. `itemId` is `walkRowKey(row)`. */
export interface WalkOptimistic { itemId: number; state: WalkItem['state'] }

/**
 * The all-decks view with some rows already in their new state. The row leaves its old stop and joins the stop the
 * server will put it in (picked-up and placed rows sit under the place they are going to, others under where they
 * are taken from). Safe to apply on data that already has the saved result. Pure.
 */
export function applyWalkOptimistic(data: AllDecksPicklist, changes: readonly WalkOptimistic[]): AllDecksPicklist {
  if (changes.length === 0) return data
  const byItem = new Map(changes.map((c) => [c.itemId, c.state]))
  const moved: WalkRow[] = []
  const counts = { ...data.counts }
  const decksProgress = (data.decks ?? []).map((d) => ({ ...d }))
  const bucket = (st: WalkItem['state']) => (st === 'to_find' ? 'open' : st) as 'open' | 'found' | 'placed' | 'missing'
  const strip = (stops: WalkStop[]) => stops
    .map((s) => ({
      ...s,
      rows: s.rows.filter((r) => {
        const next = byItem.get(walkRowKey(r))
        if (next === undefined) return true
        if (next !== r.state) {
          counts[bucket(r.state)] -= 1
          counts[bucket(next)] += 1
          const d = r.toDeckId !== null ? decksProgress.find((x) => x.deckId === r.toDeckId) : undefined
          if (d && (r.state === 'placed') !== (next === 'placed')) d.placed += next === 'placed' ? 1 : -1
        }
        moved.push({ ...r, state: next })
        return false
      }),
    }))
    .filter((s) => s.rows.length > 0)
  const boxes = strip(data.takeFromBoxes)
  const decks = strip(data.takeFromDecks)
  const places = strip(data.placeIn)
  const addTo = (list: WalkStop[], key: string, placeName: string, row: WalkRow) => {
    const stop = list.find((s) => s.key === key)
    if (stop) stop.rows.push(row)
    else list.push({ key, placeName, isUnsorted: false, rows: [row] })
  }
  for (const row of moved) {
    if (row.state === 'found' || row.state === 'placed') {
      addTo(places, row.toDeckId !== null ? `d${row.toDeckId}` : `l${row.toLocationId}`, row.toName, row)
    } else {
      const name = row.fromName ?? 'Unknown place'
      const home = decks.find((s) => s.placeName === name) ?? boxes.find((s) => s.placeName === name)
      if (home) home.rows.push(row)
      else addTo(boxes, row.fromName === null ? 'none' : `opt-${name}`, name, row)
    }
  }
  for (const list of [boxes, decks, places]) {
    for (const s of list) s.rows.sort((a, b) => a.cardName.localeCompare(b.cardName) || a.toName.localeCompare(b.toName) || a.key.localeCompare(b.key))
  }
  decks.sort(byName)
  places.sort(byName)
  boxes.sort((a, b) => (a.isUnsorted !== b.isUnsorted ? (a.isUnsorted ? -1 : 1) : byName(a, b)))
  return { ...data, takeFromBoxes: boxes, takeFromDecks: decks, placeIn: places, counts, decks: decksProgress }
}
