'use client'

import { useState } from 'react'
import { whereTheyWent, reasonText } from '@/lib/import-placement-text'
import type { ImportPlacementResult } from '../../../docs/oracle/contracts/know-where-cards-are.types'

const CAP = 10

/** "Where they went" block on the collection import result (spec section 21.6). */
export function ImportWhereTheyWent({ placement }: { placement: ImportPlacementResult | undefined }) {
  const [showWhich, setShowWhich] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const info = whereTheyWent(placement)
  if (!info || !placement) return null

  const unsorted = (placement.details ?? []).filter((d) => d.outcome === 'unsorted')
  const shown = showAll ? unsorted : unsorted.slice(0, CAP)

  return (
    <section aria-label="Where they went" className="rounded-[10px] border border-[var(--border-subtle)] px-3 py-2 text-[length:var(--fs-sm)]">
      <h4 className="text-[length:var(--fs-xs)] text-muted-foreground">{info.heading}</h4>
      <p className="mt-0.5">{info.line}</p>
      {placement.destination.kind === 'deck' && unsorted.length > 0 && (
        <div className="mt-1.5">
          <button
            type="button"
            aria-expanded={showWhich}
            onClick={() => setShowWhich((v) => !v)}
            className="min-h-8 text-[length:var(--fs-xs)] underline underline-offset-2 hover:text-foreground max-sm:min-h-11"
          >
            {unsorted.length === 1 ? 'Show which one went to Unsorted' : 'Show which went to Unsorted'}
          </button>
          {showWhich && (
            <ul className="mt-1 flex flex-col gap-0.5 text-[length:var(--fs-xs)]">
              {shown.map((d, i) => (
                <li key={`${d.cardName}-${i}`}>
                  {d.cardName} <span aria-hidden="true">·</span>{' '}
                  <span className="text-muted-foreground">
                    {d.reason ? reasonText(d.reason, placement.destination.name) : ''}
                  </span>
                </li>
              ))}
              {!showAll && unsorted.length > CAP && (
                <li>
                  <button type="button" className="underline underline-offset-2" onClick={() => setShowAll(true)}>
                    and {unsorted.length - CAP} more
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
