/* eslint-disable @next/next/no-img-element */
import { getScryfallImageUrl } from '@/lib/scryfall-image'

interface DeckRow {
  cardName: string
  scryfallId?: string | null
  qty: number
  board?: string
}

const STRIP_SIZE = 14

/** What the loaded deck holds: commander art and name, card counts, and a strip of its cards. */
export function ImportDeckDetails({
  deckName,
  commander,
  rows,
  summary,
}: {
  deckName: string
  commander: { name: string; scryfallId: string | null } | null
  rows: DeckRow[]
  summary: string
}) {
  const art = getScryfallImageUrl(commander?.scryfallId, 'art_crop')
  const main = rows.filter((r) => r.board !== 'maybeboard' && r.scryfallId && r.cardName !== commander?.name)
  const shown = main.slice(0, STRIP_SIZE)
  const unique = new Set(rows.map((r) => r.cardName)).size
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border border-[var(--border-default)] p-4">
      <div className="flex items-center gap-4">
        {art ? (
          <img src={art} alt="" className="h-20 w-28 shrink-0 rounded-md object-cover" />
        ) : null}
        <div className="min-w-0">
          <p role="status" className="text-[length:var(--fs-sm)] text-muted-foreground">
            ✓ Deck processed
          </p>
          <p className="truncate text-[length:var(--fs-lg)] font-medium">{deckName}</p>
          {commander && (
            <p className="truncate text-[length:var(--fs-sm)] text-muted-foreground">Commander: {commander.name}</p>
          )}
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">
            {summary} · {unique} different {unique === 1 ? 'card' : 'cards'}
          </p>
        </div>
      </div>
      {shown.length > 0 && (
        <div className="flex min-h-0 flex-wrap content-start gap-1.5 overflow-hidden" aria-hidden="true">
          {shown.map((r) => (
            <img
              key={`${r.scryfallId}-${r.cardName}`}
              src={getScryfallImageUrl(r.scryfallId, 'small') ?? ''}
              alt=""
              loading="lazy"
              className="h-[88px] w-[63px] rounded-[4px] object-cover"
            />
          ))}
          {main.length > shown.length && (
            <span className="flex h-[88px] w-[63px] items-center justify-center rounded-[4px] bg-[var(--bg-surface-hover)] text-[length:var(--fs-xs)] text-muted-foreground">
              +{main.length - shown.length}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
