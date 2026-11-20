'use client'
import { CARD_DETAILS_LABELS as L } from '@/lib/card-details/labels'
import type { CardDetails } from '@/lib/card-details/load'
import { TAB_BODY } from './shared'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function RulingsTab({ data }: { data: CardDetails }) {
  return (
    <div className={TAB_BODY}>
      {data.rulings.length === 0 ? (
        <p className="text-[length:var(--fs-sm)] text-muted-foreground" data-testid="card-details-no-rulings">{L.noRulings}</p>
      ) : (
        <ul className="max-w-[760px] divide-y divide-[var(--border-default)]">
          {data.rulings.map((r, i) => (
            <li key={`${r.publishedAt}-${i}`} className="flex gap-4 py-2.5 text-[length:var(--fs-sm)] max-sm:flex-col max-sm:gap-1">
              <time dateTime={r.publishedAt} className="w-24 shrink-0 text-muted-foreground">{formatDate(r.publishedAt)}</time>
              <p>{r.comment}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[length:var(--fs-xs)] text-muted-foreground">{L.rulingsFootnote}</p>
    </div>
  )
}
