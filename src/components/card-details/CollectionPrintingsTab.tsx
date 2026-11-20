'use client'
import { useMemo, useState } from 'react'
import { formatPrice } from '@/lib/collection-printing-utils'
import type { CollectionCardDetails } from '@/lib/card-details/load-collection'
import { filterSortPrintings, type PrintingFilter, type PrintingSort } from '@/lib/card-details/printings'
import { SELECT, TAB_BODY, rowKey, titleCase } from './shared'

export interface CollectionPrintingsTabProps {
  data: CollectionCardDetails
  onPreview: (scryfallId: string | null) => void
}

/** Printings in the collection context: no radio (there is no slot) and no row action ("Add a copy" is hidden). */
export function CollectionPrintingsTab({ data, onPreview }: CollectionPrintingsTabProps) {
  const [filter, setFilter] = useState<PrintingFilter>('all')
  const [sort, setSort] = useState<PrintingSort>('newest')
  const all = data.printings
  const rows = useMemo(() => filterSortPrintings(all, filter, sort), [all, filter, sort])
  const ownCount = all.filter((p) => p.owned > 0).length
  const pill = (id: PrintingFilter, label: string) => (
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
          <select value={sort} onChange={(e) => setSort(e.target.value as PrintingSort)} className={SELECT} aria-label="Sort printings">
            <option value="newest">Newest</option>
            <option value="cheapest">Cheapest</option>
          </select>
        </label>
      </div>
      {all.length === 0 ? (
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">No printings found for this card.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[length:var(--fs-sm)]">
            <caption className="sr-only">Printings of this card</caption>
            <thead className="text-[length:var(--fs-xs)] uppercase tracking-wide text-muted-foreground">
              <tr>
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
              {rows.map((p) => (
                <tr
                  key={rowKey(p)}
                  data-testid="card-details-printing-row"
                  onMouseEnter={() => onPreview(p.scryfallId)}
                  onMouseLeave={() => onPreview(null)}
                  className="border-t border-[var(--border-default)]"
                >
                  <td className="py-1.5">
                    {p.imageSmall ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageSmall} alt="" loading="lazy" width={28} height={39} className="h-[39px] w-7 rounded-sm object-cover" />
                    ) : null}
                  </td>
                  <td className="py-1.5">{p.setName}</td>
                  <td className="py-1.5">{p.collectorNumber}</td>
                  <td className="py-1.5">{titleCase(p.rarity)}</td>
                  <td className="py-1.5">{titleCase(p.finish === 'nonfoil' ? 'Nonfoil' : p.finish)}</td>
                  <td className="py-1.5">{p.owned > 0 ? p.owned : '–'}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.priceUsd == null ? '–' : formatPrice(p.priceUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
