'use client'

import type { DeckCard } from '@/components/CardGrid'
import { parseCategoriesCapped } from '@/lib/categoryUtils'

interface CategoriesPanelProps {
  cards: DeckCard[]
}

// Standard Commander category targets
const CATEGORY_TARGETS: Record<string, string> = {
  Ramp: '10–12',
  Draw: '10–12',
  Removal: '8–10',
  Protection: '3–5',
  Finisher: '4–6',
  Land: '35–37',
}

function getActiveCards(cards: DeckCard[]): DeckCard[] {
  return cards.filter(c => {
    const cat = parseCategoriesCapped(c.categories).primary_category
    return cat !== 'Maybeboard' && cat !== 'Sideboard'
  })
}

export function CategoriesPanel({ cards }: CategoriesPanelProps) {
  const active = getActiveCards(cards)

  // Group by category
  const groups: Record<string, DeckCard[]> = {}
  for (const card of active) {
    const cat = parseCategoriesCapped(card.categories).primary_category
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(card)
  }

  // Sort categories: Land first, then by count descending
  const sortedEntries = Object.entries(groups).sort(([a, cardsA], [b, cardsB]) => {
    if (a === 'Commander') return -1
    if (b === 'Commander') return 1
    if (a === 'Land') return -1
    if (b === 'Land') return 1
    const countA = cardsA.reduce((s, c) => s + (c.quantity || 1), 0)
    const countB = cardsB.reduce((s, c) => s + (c.quantity || 1), 0)
    return countB - countA
  })

  const totalCards = active.reduce((sum, c) => sum + (c.quantity || 1), 0)
  const categoryCount = sortedEntries.length

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      {/* Summary Table */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Category Breakdown</h2>
        {categoryCount > 8 && (
          <div className="mb-3 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', border: '1px solid rgba(251, 191, 36, 0.3)', color: '#fbbf24' }}>
            {categoryCount} categories — consider merging. Category View works best with 6–8.
          </div>
        )}
        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Role</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Target</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Actual</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedEntries.map(([cat, catCards]) => {
                const count = catCards.reduce((s, c) => s + (c.quantity || 1), 0)
                const target = CATEGORY_TARGETS[cat]
                let status: 'ok' | 'low' | 'high' | 'neutral' = 'neutral'
                if (target) {
                  const [lo, hi] = target.split('–').map(Number)
                  if (count < lo) status = 'low'
                  else if (count > hi) status = 'high'
                  else status = 'ok'
                }
                return (
                  <tr key={cat} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{cat}</td>
                    <td className="px-4 py-2 text-muted-foreground">{target || '—'}</td>
                    <td className="px-4 py-2 tabular-nums font-medium">{count}</td>
                    <td className="px-4 py-2">
                      {status === 'ok' && <span className="text-xs text-green-600">✓ On target</span>}
                      {status === 'low' && <span className="text-xs text-amber-600">↓ Below target</span>}
                      {status === 'high' && <span className="text-xs text-blue-600">↑ Above target</span>}
                      {status === 'neutral' && <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t border-border bg-muted/50">
              <tr>
                <td className="px-4 py-2 font-semibold">Total</td>
                <td className="px-4 py-2 text-muted-foreground">100</td>
                <td className="px-4 py-2 font-semibold tabular-nums">{totalCards}</td>
                <td className="px-4 py-2">
                  {totalCards === 100 ? (
                    <span className="text-xs text-green-600">✓</span>
                  ) : (
                    <span className="text-xs text-amber-600">≠ 100</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Visual Bar Chart */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Visual Distribution</h2>
        <div className="space-y-2">
          {sortedEntries
            .filter(([cat]) => cat !== 'Land' && cat !== 'Commander')
            .map(([cat, catCards]) => {
              const count = catCards.reduce((s, c) => s + (c.quantity || 1), 0)
              const maxCount = Math.max(
                ...sortedEntries
                  .filter(([c]) => c !== 'Land' && c !== 'Commander')
                  .map(([, cc]) => cc.reduce((s, c) => s + (c.quantity || 1), 0)),
                1
              )
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{cat}</span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="flex h-full items-center rounded bg-primary/60 px-2 transition-all"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    >
                      <span className="text-[10px] font-medium text-primary-foreground">{count}</span>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      </section>

      {/* Card Lists per Category */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Cards by Category</h2>
        <div className="space-y-4">
          {sortedEntries.map(([cat, catCards]) => (
            <details key={cat} className="rounded-lg border border-border">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium hover:bg-muted/30">
                {cat} ({catCards.reduce((s, c) => s + (c.quantity || 1), 0)})
              </summary>
              <div className="border-t border-border px-4 py-2">
                <ul className="columns-2 gap-4 text-xs text-muted-foreground">
                  {catCards
                    .sort((a, b) => a.card_name.localeCompare(b.card_name))
                    .map(card => (
                      <li key={card.id} className="py-0.5">
                        {card.quantity > 1 && <span className="text-foreground">{card.quantity}× </span>}
                        {card.card_name}
                      </li>
                    ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
