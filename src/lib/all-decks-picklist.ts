/**
 * All-decks Picklist: the saved steps (move_items) of every deck, laid out in walking order.
 * Contract: know-where-cards-are.md (GET /api/picklist) and spec section 4 / 20.5. Pure; the route does the reading.
 *
 * Stops: take from boxes (Unsorted first, then A to Z), take from decks (A to Z), place in decks and boxes (A to Z).
 * A card is "on the walk" only when it has a saved step. Unowned cards never appear as rows (spec 20.5, Q15); only a count per deck.
 */

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
export interface WalkNames {
  decks: Map<number, string>
  /** locationId -> name and whether it is Unsorted */
  locations: Map<number, { name: string; isUnsorted: boolean }>
}
export interface WalkRow {
  itemId: number
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
}
export interface WalkStop { key: string; placeName: string; isUnsorted: boolean; rows: WalkRow[] }
export interface AllDecksPicklist {
  takeFromBoxes: WalkStop[]
  takeFromDecks: WalkStop[]
  placeIn: WalkStop[]
  counts: { total: number; found: number; placed: number; missing: number; open: number }
  /** Per deck, how many planned cards the owner does not own at all (a COUNT only; the cards are never listed here). */
  unownedByDeck: UnownedDeckCount[]
}
export interface UnownedDeckCount { deckId: number; deckName: string; count: number }

const byName = (a: WalkStop, b: WalkStop) => a.placeName.localeCompare(b.placeName)

export function buildAllDecksPicklist(items: readonly WalkItem[], names: WalkNames, unownedByDeck: readonly UnownedDeckCount[] = []): AllDecksPicklist {
  const deckName = (id: number | null) => (id === null ? null : names.decks.get(id) ?? 'a deck')
  const loc = (id: number | null) => (id === null ? null : names.locations.get(id) ?? { name: 'a box', isUnsorted: false })
  const boxes = new Map<string, WalkStop>()
  const decks = new Map<string, WalkStop>()
  const places = new Map<string, WalkStop>()
  const add = (map: Map<string, WalkStop>, key: string, placeName: string, isUnsorted: boolean, row: WalkRow) => {
    const stop = map.get(key) ?? { key, placeName, isUnsorted, rows: [] }
    stop.rows.push(row)
    map.set(key, stop)
  }
  const counts = { total: 0, found: 0, placed: 0, missing: 0, open: 0 }

  for (const i of items) {
    const from = i.fromDeckId !== null ? { name: deckName(i.fromDeckId) as string, isUnsorted: false } : loc(i.fromLocationId)
    const to = i.toDeckId !== null ? (deckName(i.toDeckId) as string) : (loc(i.toLocationId)?.name ?? 'a box')
    const row: WalkRow = {
      itemId: i.id, state: i.state, copyId: i.copyId, cardName: i.cardName, isProxy: i.isProxy,
      fromName: from?.name ?? null, toName: to, toDeckId: i.toDeckId, toDeckCardId: i.toDeckCardId, toLocationId: i.toLocationId,
    }
    counts.total += 1
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
  const sort = (m: Map<string, WalkStop>, unsortedFirst: boolean) => {
    const list = [...m.values()]
    for (const s of list) s.rows.sort((a, b) => a.cardName.localeCompare(b.cardName) || a.itemId - b.itemId)
    return list.sort((a, b) => (unsortedFirst && a.isUnsorted !== b.isUnsorted ? (a.isUnsorted ? -1 : 1) : byName(a, b)))
  }
  return { takeFromBoxes: sort(boxes, true), takeFromDecks: sort(decks, false), placeIn: sort(places, false), counts, unownedByDeck: [...unownedByDeck].filter((u) => u.count > 0).sort((a, b) => a.deckName.localeCompare(b.deckName)) }
}

/** The one-line footnote about unowned cards (owner decision 2026-11-16: a count only, never a list). */
export function unownedFootnote(count: number, deckName: string): string | null {
  if (count <= 0) return null
  return `${count} unowned card${count === 1 ? '' : 's'} in ${deckName} ${count === 1 ? "isn't" : "aren't"} listed here. Open the deck's Picklist.`
}

/** A change shown at once on the all-decks Picklist, before the save answers. */
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
  const bucket = (st: WalkItem['state']) => (st === 'to_find' ? 'open' : st) as 'open' | 'found' | 'placed' | 'missing'
  const strip = (stops: WalkStop[]) => stops
    .map((s) => ({
      ...s,
      rows: s.rows.filter((r) => {
        const next = byItem.get(r.itemId)
        if (next === undefined) return true
        if (next !== r.state) {
          counts[bucket(r.state)] -= 1
          counts[bucket(next)] += 1
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
    for (const s of list) s.rows.sort((a, b) => a.cardName.localeCompare(b.cardName) || a.itemId - b.itemId)
  }
  decks.sort(byName)
  places.sort(byName)
  boxes.sort((a, b) => (a.isUnsorted !== b.isUnsorted ? (a.isUnsorted ? -1 : 1) : byName(a, b)))
  return { ...data, takeFromBoxes: boxes, takeFromDecks: decks, placeIn: places, counts }
}
