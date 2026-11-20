/**
 * Pure shaping of ref_printings rows (all printings of one card, by oracle_id) into one row per printing and finish.
 * A price that is missing stays null (the screen shows no value, never $0).
 */
export interface PrintingRow {
  scryfall_id: string
  set_code: string
  set_name: string
  collector_number: string
  rarity: string
  finishes: string[] | null
  price_usd: number | string | null
  price_usd_foil: number | string | null
  released_at: string | null
  image_uri_small: string | null
  image_uri_normal: string | null
}

export type Finish = 'nonfoil' | 'foil' | 'etched'

export interface PrintingFinishRow {
  scryfallId: string
  setCode: string
  setName: string
  collectorNumber: string
  rarity: string
  finish: Finish
  priceUsd: number | null
  releasedAt: string | null
  imageSmall: string | null
  imageNormal: string | null
  /** Non-missing copies the user owns of exactly this printing and finish. */
  owned: number
  /** True when this is the printing the deck slot is set to. */
  isSlotPrinting: boolean
}

const FINISH_ORDER: Finish[] = ['nonfoil', 'foil', 'etched']

function toPrice(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Price for a finish. Etched has no stored price, so it is null rather than the foil price. */
export function priceForFinish(row: Pick<PrintingRow, 'price_usd' | 'price_usd_foil'>, finish: Finish): number | null {
  if (finish === 'nonfoil') return toPrice(row.price_usd)
  if (finish === 'foil') return toPrice(row.price_usd_foil)
  return null
}

/** key used to count owned copies: `${scryfallId}|${finish}` */
export function ownedKey(scryfallId: string, finish: string | null | undefined): string {
  return `${scryfallId}|${finish ?? 'nonfoil'}`
}

export function shapePrintings(
  rows: readonly PrintingRow[],
  opts: { owned: ReadonlyMap<string, number>; slotScryfallId: string | null },
): PrintingFinishRow[] {
  const out: PrintingFinishRow[] = []
  for (const row of rows) {
    const finishes = (row.finishes ?? []).filter((f): f is Finish => (FINISH_ORDER as string[]).includes(f))
    // A printing with no finish list is shown once as nonfoil rather than dropped.
    const list: Finish[] = finishes.length > 0 ? FINISH_ORDER.filter((f) => finishes.includes(f)) : ['nonfoil']
    for (const finish of list) {
      out.push({
        scryfallId: row.scryfall_id,
        setCode: row.set_code,
        setName: row.set_name,
        collectorNumber: row.collector_number,
        rarity: row.rarity,
        finish,
        priceUsd: priceForFinish(row, finish),
        releasedAt: row.released_at,
        imageSmall: row.image_uri_small,
        imageNormal: row.image_uri_normal,
        owned: opts.owned.get(ownedKey(row.scryfall_id, finish)) ?? 0,
        isSlotPrinting: opts.slotScryfallId === row.scryfall_id,
      })
    }
  }
  // Default order: newest first, then set code and number so it is stable.
  return out.sort(
    (a, b) =>
      (b.releasedAt ?? '').localeCompare(a.releasedAt ?? '') ||
      a.setCode.localeCompare(b.setCode) ||
      a.collectorNumber.localeCompare(b.collectorNumber, undefined, { numeric: true }) ||
      FINISH_ORDER.indexOf(a.finish) - FINISH_ORDER.indexOf(b.finish),
  )
}

export type PrintingFilter = 'all' | 'own' | 'foil'
export type PrintingSort = 'newest' | 'cheapest'
/** The Printings tab's filter pills and sort, shared by the deck and collection windows. */
export function filterSortPrintings(all: readonly PrintingFinishRow[], filter: PrintingFilter, sort: PrintingSort): PrintingFinishRow[] {
  const list = all.filter((p) => (filter === 'own' ? p.owned > 0 : filter === 'foil' ? p.finish !== 'nonfoil' : true))
  return [...list].sort((a, b) =>
    sort === 'newest'
      ? (b.releasedAt ?? '').localeCompare(a.releasedAt ?? '')
      : (a.priceUsd ?? Infinity) - (b.priceUsd ?? Infinity) || (b.releasedAt ?? '').localeCompare(a.releasedAt ?? ''),
  )
}
