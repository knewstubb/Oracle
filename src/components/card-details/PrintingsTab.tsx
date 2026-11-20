'use client'
import { useMemo, useState } from 'react'
import { formatPrice } from '@/lib/collection-printing-utils'
import { CARD_DETAILS_LABELS as L } from '@/lib/card-details/labels'
import type { CardDetails } from '@/lib/card-details/load'
import { filterSortPrintings, type PrintingFilter as Filter, type PrintingSort as Sort, type PrintingFinishRow } from '@/lib/card-details/printings'
import { SELECT, TAB_BODY, finishSuffix, rowKey, titleCase } from './shared'
import { useRefreshAfterChange } from './useCardDetailsData'


export interface PrintingsTabProps {
  deckId: number
  cardId: number
  data: CardDetails
  /** Hover or focus on a row shows that printing in the rail (null when it leaves). */
  onPreview: (scryfallId: string | null) => void
}

export function PrintingsTab({ deckId, cardId, data, onPreview }: PrintingsTabProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('newest')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useRefreshAfterChange(deckId, cardId)
  const sleeved = data.slot.copyId != null
  const all = data.printings

  const currentKey = useMemo(() => {
    const flagged = all.filter((p) => p.isSlotPrinting)
    const current = flagged.find((p) => p.finish === (data.slot.finish ?? 'nonfoil')) ?? flagged[0]
    return current ? rowKey(current) : null
  }, [all, data.slot.finish])
  const selected = pending ?? currentKey

  const rows = useMemo(() => filterSortPrintings(all, filter, sort), [all, filter, sort])
  const ownCount = all.filter((p) => p.owned > 0).length

  const choose = async (p: PrintingFinishRow) => {
    if (sleeved) return
    setError(null)
    setPending(rowKey(p))
    try {
      const res = await fetch(`/api/decks/${deckId}/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scryfall_id: p.scryfallId, set_code: p.setCode, finish: p.finish, slotOnly: true }),
      })
      if (!res.ok) throw new Error('save failed')
      refresh()
    } catch {
      setError("Couldn't change the printing. Nothing was changed.")
    } finally {
      setPending(null)
    }
  }

  const pill = (id: Filter, label: string) => (
    <button
      key={id}
      type="button"
      aria-pressed={filter === id}
      onClick={() => setFilter(id)}
      className={`rounded-full border px-3 py-1 text-[length:var(--fs-sm)] max-sm:min-h-11 ${filter === id ? 'border-[var(--text-primary)] font-medium' : 'border-[var(--border-default)] text-muted-foreground'}`}
    >
      {label}
    </button>
  )

  return (
    <div className={TAB_BODY}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {pill('all', `All ${all.length}`)}
        {pill('own', `You own ${ownCount}`)}
        {pill('foil', 'Foil')}
        <label className="ml-auto flex items-center gap-2 text-[length:var(--fs-sm)] text-muted-foreground">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={SELECT} aria-label="Sort printings">
            <option value="newest">Newest</option>
            <option value="cheapest">Cheapest</option>
          </select>
        </label>
      </div>
      {sleeved && <p role="note" data-testid="card-details-printing-note" className="mb-3 rounded-md border border-[var(--border-default)] p-2 text-[length:var(--fs-sm)]">{L.printingFollowsCopy}</p>}
      {error && <p role="alert" className="mb-3 text-[length:var(--fs-sm)]" style={{ color: 'var(--signal-critical)' }}>{error}</p>}
      {all.length === 0 ? (
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">No printings found for this card.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[length:var(--fs-sm)]">
            <caption className="sr-only">Printings of this card</caption>
            <thead className="text-[length:var(--fs-xs)] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="w-8 py-1"><span className="sr-only">Use in this slot</span></th>
                <th scope="col" className="w-10 py-1"><span className="sr-only">Picture</span></th>
                <th scope="col" className="py-1">Set</th>
                <th scope="col" className="py-1">No.</th>
                <th scope="col" className="py-1">Rarity</th>
                <th scope="col" className="py-1">Finish</th>
                <th scope="col" className="py-1">You own</th>
                <th scope="col" className="py-1 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const key = rowKey(p)
                const isSel = selected === key
                return (
                  <tr
                    key={key}
                    data-testid="card-details-printing-row"
                    data-selected={isSel}
                    onMouseEnter={() => onPreview(p.scryfallId)}
                    onMouseLeave={() => onPreview(null)}
                    onFocus={() => onPreview(p.scryfallId)}
                    onBlur={() => onPreview(null)}
                    className={`border-t border-[var(--border-default)] ${isSel ? 'bg-[var(--bg-tertiary)] shadow-[inset_3px_0_0_var(--signal-success)]' : ''}`}
                  >
                    <td className="py-1.5 pl-1">
                      <input
                        type="radio"
                        name="card-details-printing"
                        checked={isSel}
                        disabled={sleeved || pending !== null}
                        onChange={() => void choose(p)}
                        aria-label={`Use ${p.setName} ${p.collectorNumber}${finishSuffix(p.finish)} in this slot`}
                        className="size-4 max-sm:size-6"
                      />
                    </td>
                    <td className="py-1.5">
                      {p.imageSmall ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageSmall} alt="" loading="lazy" width={28} height={39} className="h-[39px] w-7 rounded-sm object-cover" />
                      ) : null}
                    </td>
                    <td className="py-1.5">
                      {p.setName}
                      {p.isSlotPrinting && <span className="ml-1 text-[length:var(--fs-xs)] text-muted-foreground">in this deck</span>}
                    </td>
                    <td className="py-1.5">{p.collectorNumber}</td>
                    <td className="py-1.5">{titleCase(p.rarity)}</td>
                    <td className="py-1.5">{titleCase(p.finish === 'nonfoil' ? 'Nonfoil' : p.finish)}</td>
                    <td className="py-1.5">{p.owned > 0 ? p.owned : '–'}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.priceUsd == null ? '–' : formatPrice(p.priceUsd)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[length:var(--fs-xs)] text-muted-foreground">{L.printingFootnote}</p>
    </div>
  )
}
