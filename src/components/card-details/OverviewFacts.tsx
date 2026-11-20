'use client'
import { useState } from 'react'
import { ColourPips } from '@/components/ColourPips'
import { parseTypeLine, frontFace } from '@/lib/type-line'
import { CARD_DETAILS_LABELS as L } from '@/lib/card-details/labels'
import type { CardFacts, TagChip } from '@/lib/card-details/load'
import { OracleText } from './shared'

const TAG_CAP = 3

/** The left column of both Overview tabs: card text, stats and Tags. */
export function OverviewFacts({ facts, tags }: { facts: CardFacts | null; tags: TagChip[] }) {
  const front = frontFace(parseTypeLine(facts?.typeLine))
  const colours = (facts?.colourIdentity ?? '').match(/[WUBRG]/g) ?? []
  const stats: Array<{ label: string; value: React.ReactNode }> = []
  if (facts?.manaValue != null) stats.push({ label: 'Mana value', value: facts.manaValue })
  if (colours.length > 0) stats.push({ label: 'Colour identity', value: <ColourPips colours={colours} size={16} /> })
  if (facts?.power != null && facts?.toughness != null) stats.push({ label: 'P / T', value: `${facts.power} / ${facts.toughness}` })
  if (front.subtypes.length > 0) stats.push({ label: 'Subtypes', value: front.subtypes.join(', ') })
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {facts?.oracleText ? (
        <div className="rounded-lg bg-[var(--bg-tertiary)] p-3 text-[length:var(--fs-sm)]" data-testid="card-details-oracle">
          <OracleText text={facts.oracleText} />
        </div>
      ) : (
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">No card text for this card.</p>
      )}
      {stats.length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2" data-testid="card-details-stats">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-[length:var(--fs-xs)] uppercase tracking-wide text-muted-foreground">{s.label}</dt>
              <dd className="text-[length:var(--fs-sm)]">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <TagsSection tags={tags} />
    </div>
  )
}

function TagsSection({ tags }: { tags: TagChip[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? tags : tags.slice(0, TAG_CAP)
  const more = tags.length - TAG_CAP
  return (
    <section aria-labelledby="cd-tags" data-testid="card-details-tags">
      <h3 id="cd-tags" className="text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-muted-foreground">{L.tagsHeading}</h3>
      {tags.length === 0 ? (
        <p className="mt-1 text-[length:var(--fs-sm)] text-muted-foreground">{L.noTags}</p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label="Tags">
          {shown.map((t) => (
            <li key={t.key} className="rounded-full border border-[var(--border-emphasis)] px-2 py-0.5 text-[length:var(--fs-sm)]">{t.displayName}</li>
          ))}
          {more > 0 && (
            <li>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
                className="rounded-full px-2 py-0.5 text-[length:var(--fs-sm)] text-muted-foreground underline max-sm:min-h-11"
              >
                {expanded ? 'Show fewer' : `+${more} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

