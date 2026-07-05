'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { DeckCard } from '@/components/CardGrid'
import type { DeckRatingsContent } from '@/lib/rating-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalysisTabProps {
  cards: DeckCard[]
  deckId: number
  bracket: string | null
}

interface AttributeRating {
  label: string
  score: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePrimaryCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string')
      return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
  } catch {
    /* not JSON */
  }
  return raw.split(',')[0]?.trim().replace(/\(top\)|\(bottom\)/gi, '') || 'Other'
}

function getActiveCards(cards: DeckCard[]): DeckCard[] {
  return cards.filter((c) => {
    const cat = parsePrimaryCategory(c.categories)
    return cat !== 'Maybeboard' && cat !== 'Sideboard'
  })
}

function isLand(card: DeckCard): boolean {
  return parsePrimaryCategory(card.categories) === 'Land'
}

/**
 * Compute mana curve buckets (1, 2, 3, 4, 5, 6+) from card category heuristics.
 * Since DeckCard doesn't have CMC, we estimate based on card category:
 * - Ramp → CMC 2
 * - Lands → excluded
 * - Commander → CMC 5
 * - Draw → CMC 3
 * - Removal → CMC 3
 * - Win Condition → CMC 5
 * - Other → CMC 3
 *
 * NOTE: These are rough estimates. When CMC data is available on DeckCard,
 * this function should use actual CMC values.
 */
function estimateCmcFromCategory(category: string): number {
  const lower = category.toLowerCase()
  if (lower === 'land' || lower === 'lands') return 0
  if (lower === 'ramp') return 2
  if (lower === 'commander') return 5
  if (lower === 'draw' || lower === 'card draw' || lower === 'card advantage') return 3
  if (lower === 'removal' || lower === 'interaction') return 3
  if (lower === 'win condition' || lower === 'finisher' || lower === 'combo') return 5
  if (lower === 'protection' || lower === 'counterspell') return 2
  if (lower === 'tokens') return 4
  if (lower === 'tribal') return 3
  if (lower === 'recursion') return 4
  if (lower === 'tutor') return 3
  return 3
}

function computeManaCurve(cards: DeckCard[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0] // indices 0-5 → CMC 1, 2, 3, 4, 5, 6+
  for (const card of cards) {
    if (isLand(card)) continue
    const cat = parsePrimaryCategory(card.categories)
    const cmc = estimateCmcFromCategory(cat)
    if (cmc <= 0) continue
    const qty = card.quantity || 1
    if (cmc >= 6) {
      buckets[5] += qty
    } else {
      buckets[cmc - 1] += qty
    }
  }
  return buckets
}

/**
 * Derive simple attribute scores from card data.
 * Returns scores 1-10 for each attribute.
 */
function computeHeuristicRatings(cards: DeckCard[]): AttributeRating[] {
  const active = getActiveCards(cards)
  const catCounts: Record<string, number> = {}
  for (const card of active) {
    const cat = parsePrimaryCategory(card.categories).toLowerCase()
    catCounts[cat] = (catCounts[cat] || 0) + (card.quantity || 1)
  }

  // Draw count → Card Advantage score
  const drawCount = (catCounts['draw'] || 0) + (catCounts['card draw'] || 0) + (catCounts['card advantage'] || 0)
  let cardAdvantage: number
  if (drawCount >= 10) cardAdvantage = Math.min(10, 8 + Math.floor((drawCount - 10) / 2))
  else if (drawCount >= 8) cardAdvantage = 6 + (drawCount - 8)
  else cardAdvantage = Math.max(1, Math.min(5, drawCount))

  // Interaction = removal + counterspell count mapped 0–15 → 1–10
  const interactionCount = (catCounts['removal'] || 0) + (catCounts['interaction'] || 0) + (catCounts['counterspell'] || 0) + (catCounts['protection'] || 0)
  const interaction = Math.max(1, Math.min(10, Math.round(interactionCount * 10 / 15)))

  // Speed = inverse of estimated avg CMC (lower avg → higher speed)
  const nonLand = active.filter((c) => !isLand(c))
  const totalEstCmc = nonLand.reduce((sum, c) => {
    return sum + estimateCmcFromCategory(parsePrimaryCategory(c.categories)) * (c.quantity || 1)
  }, 0)
  const nonLandCount = nonLand.reduce((sum, c) => sum + (c.quantity || 1), 0)
  const avgCmc = nonLandCount > 0 ? totalEstCmc / nonLandCount : 3
  const speed = Math.max(1, Math.min(10, Math.round(11 - avgCmc * 2)))

  // Consistency = tutor count + draw engines, mapped 0–20 → 1–10
  const tutorCount = catCounts['tutor'] || 0
  const consistencyRaw = tutorCount + drawCount
  const consistency = Math.max(1, Math.min(10, Math.round(consistencyRaw * 10 / 20)))

  // Resilience = recursion + protection, mapped 0–12 → 1–10
  const resilienceRaw = (catCounts['recursion'] || 0) + (catCounts['protection'] || 0) + (catCounts['graveyard'] || 0)
  const resilience = Math.max(1, Math.min(10, Math.round(resilienceRaw * 10 / 12)))

  return [
    { label: 'Consistency', score: consistency },
    { label: 'Resilience', score: resilience },
    { label: 'Interaction', score: interaction },
    { label: 'Speed', score: speed },
    { label: 'Card Advantage', score: cardAdvantage },
  ]
}

/** MTG colour swatches */
const COLOUR_MAP: Record<string, { name: string; swatch: string }> = {
  W: { name: 'White', swatch: '#F9FAF4' },
  U: { name: 'Blue', swatch: '#0E68AB' },
  B: { name: 'Black', swatch: '#150B00' },
  R: { name: 'Red', swatch: '#D3202A' },
  G: { name: 'Green', swatch: '#00733E' },
}

/** Extract colour pips from cards' categories/tags (heuristic) */
function computeColourPips(cards: DeckCard[], colourIdentity: string | null): Record<string, number> {
  // Use the deck's colour identity to determine which colours are relevant
  const pips: Record<string, number> = {}
  const identity = colourIdentity
    ? colourIdentity.includes(',')
      ? colourIdentity.split(',').map((c) => c.trim().toUpperCase())
      : colourIdentity.toUpperCase().split('').filter((c) => 'WUBRG'.includes(c))
    : []
  for (const colour of identity) {
    if (COLOUR_MAP[colour]) {
      pips[colour] = 0
    }
  }

  // Simple heuristic: distribute non-land, non-colorless cards across the deck's colours
  const active = getActiveCards(cards)
  const nonLand = active.filter((c) => !isLand(c))
  const totalNonLand = nonLand.reduce((sum, c) => sum + (c.quantity || 1), 0)

  if (identity.length > 0 && totalNonLand > 0) {
    // Rough estimate: distribute evenly with slight variance
    const perColour = Math.floor(totalNonLand / identity.length)
    for (const colour of identity) {
      pips[colour] = perColour
    }
    // Assign remainder to first colour
    const remainder = totalNonLand - perColour * identity.length
    if (identity.length > 0) {
      pips[identity[0]] += remainder
    }
  }

  return pips
}

// Category distribution targets for status badges
const CATEGORY_TARGETS: Record<string, { min: number; max: number }> = {
  ramp: { min: 10, max: 12 },
  draw: { min: 10, max: 12 },
  removal: { min: 8, max: 10 },
  lands: { min: 35, max: 37 },
  land: { min: 35, max: 37 },
  'win condition': { min: 4, max: 6 },
}

function getCategoryStatus(category: string, count: number): { label: string; colour: string } | null {
  const lower = category.toLowerCase()
  const target = CATEGORY_TARGETS[lower]
  if (!target) return null // unmonitored
  if (count >= target.min && count <= target.max) return { label: 'On target', colour: '#1D9E75' }
  if (count < target.min) return { label: 'Below target', colour: '#EF9F27' }
  return { label: 'Above target', colour: '#1D9E75' }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnalysisTab({ cards, deckId, bracket }: AnalysisTabProps) {
  // Fetch ratings data if available (provides more accurate scores)
  const { data: ratings } = useQuery<DeckRatingsContent | null>({
    queryKey: ['decks', deckId, 'ratings'],
    queryFn: () =>
      fetch(`/api/decks/${deckId}/ratings`).then((r) => {
        if (r.status === 404) return null
        if (!r.ok) throw new Error('Failed to fetch ratings')
        return r.json()
      }),
    staleTime: 5 * 60 * 1000,
  })

  // Fetch deck metadata for colour identity
  const { data: deckData } = useQuery<{ deck: { colour_identity: string | null } }>({
    queryKey: ['decks', deckId],
    queryFn: () => fetch(`/api/decks/${deckId}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const active = useMemo(() => getActiveCards(cards), [cards])

  const totalCards = useMemo(
    () => active.reduce((sum, c) => sum + (c.quantity || 1), 0),
    [active]
  )

  const proxyCount = useMemo(
    () =>
      active
        .filter((c) => c.allocation_role === 'proxy')
        .reduce((sum, c) => sum + (c.quantity || 1), 0),
    [active]
  )

  const landCount = useMemo(
    () => active.filter((c) => isLand(c)).reduce((sum, c) => sum + (c.quantity || 1), 0),
    [active]
  )

  const nonLandCount = useMemo(() => totalCards - landCount, [totalCards, landCount])

  // Avg CMC — estimated from category heuristics
  const avgCmc = useMemo(() => {
    const nonLand = active.filter((c) => !isLand(c))
    const totalEstCmc = nonLand.reduce((sum, c) => {
      return sum + estimateCmcFromCategory(parsePrimaryCategory(c.categories)) * (c.quantity || 1)
    }, 0)
    const count = nonLand.reduce((sum, c) => sum + (c.quantity || 1), 0)
    return count > 0 ? totalEstCmc / count : 0
  }, [active])

  // Mana curve
  const manaCurve = useMemo(() => computeManaCurve(active), [active])
  const maxBucket = useMemo(() => Math.max(...manaCurve, 1), [manaCurve])

  // Attribute ratings
  const attributeRatings = useMemo(() => {
    if (ratings?.scores) {
      // Use real ratings when available
      return [
        { label: 'Consistency', score: ratings.scores.consistency },
        { label: 'Resilience', score: ratings.scores.resilience },
        { label: 'Interaction', score: ratings.scores.interaction },
        { label: 'Speed', score: ratings.scores.speed },
        { label: 'Card Advantage', score: computeHeuristicRatings(cards).find((r) => r.label === 'Card Advantage')?.score ?? 5 },
      ]
    }
    return computeHeuristicRatings(cards)
  }, [cards, ratings])

  // Colour pips
  const colourPips = useMemo(
    () => computeColourPips(active, deckData?.deck?.colour_identity ?? null),
    [active, deckData]
  )

  // Category distribution
  const categoryDist = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const card of active) {
      const cat = parsePrimaryCategory(card.categories)
      counts[cat] = (counts[cat] || 0) + (card.quantity || 1)
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [active])

  const maxCatCount = useMemo(
    () => Math.max(...categoryDist.map(([, v]) => v), 1),
    [categoryDist]
  )

  return (
    <div className="mx-auto max-w-[1080px] pb-12" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ─── Top row: 4 stat cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        <StatCard label="Total cards" value={totalCards.toString()} sub="100 target" />
        <StatCard label="Avg. CMC" value={avgCmc > 0 ? avgCmc.toFixed(2) : '—'} sub="Non-land spells" />
        <StatCard label="Proxies" value={proxyCount.toString()} accent="amber" sub={`${totalCards - proxyCount} originals`} />
        <StatCard label="Bracket" value={bracket ?? '—'} sub="Power level" />
      </div>

      {/* ─── Two-column row: Attributes + Mana Curve ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Left: Attribute ratings */}
        <section
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '0.5px solid rgba(255,255,255,0.07)',
            borderRadius: '10px',
            padding: '16px',
          }}
          aria-label="Attribute ratings"
        >
          <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '14px' }}>
            Attribute ratings
          </h3>
          <div>
            {attributeRatings.map((attr) => (
              <AttributeBar key={attr.label} label={attr.label} score={attr.score} />
            ))}
          </div>
        </section>

        {/* Right: Mana curve */}
        <section
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '0.5px solid rgba(255,255,255,0.07)',
            borderRadius: '10px',
            padding: '16px',
          }}
          aria-label="Mana curve"
        >
          <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '14px' }}>
            Mana curve
          </h3>
          <ManaCurveChart buckets={manaCurve} maxBucket={maxBucket} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
              Lands: {landCount} · Non-land: {nonLandCount}
            </span>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
              CMC {avgCmc > 0 ? avgCmc.toFixed(2) : '—'} avg
            </span>
          </div>
        </section>
      </div>

      {/* ─── Two-column row: Colour Pips + Category Distribution ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Left: Colour pips */}
        <section
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '0.5px solid rgba(255,255,255,0.07)',
            borderRadius: '10px',
            padding: '16px',
          }}
          aria-label="Colour distribution"
        >
          <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '14px' }}>
            Colour pips
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.entries(colourPips).map(([colour, count]) => {
              const info = COLOUR_MAP[colour]
              if (!info) return null
              const maxPips = Math.max(...Object.values(colourPips), 1)
              const needsBorder = colour === 'B' || colour === 'W'
              return (
                <div key={colour} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '2px',
                      flexShrink: 0,
                      backgroundColor: info.swatch,
                      border: needsBorder ? '0.5px solid rgba(255,255,255,0.15)' : undefined,
                    }}
                    aria-hidden="true"
                  />
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', minWidth: '40px' }}>
                    {info.name}
                  </span>
                  <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        borderRadius: '2px',
                        width: `${maxPips > 0 ? (count / maxPips) * 100 : 0}%`,
                        backgroundColor: colour === 'B' ? '#555' : info.swatch,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', minWidth: '28px', textAlign: 'right' }}>
                    {count}
                  </span>
                </div>
              )
            })}
            {Object.keys(colourPips).length === 0 && (
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>No colour data available</p>
            )}
            {Object.keys(colourPips).length > 0 && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginBottom: '6px' }}>
                  Land recommendations
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                  Distribute land sources proportionally to pip counts.
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right: Category distribution */}
        <section
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '0.5px solid rgba(255,255,255,0.07)',
            borderRadius: '10px',
            padding: '16px',
          }}
          aria-label="Category distribution"
        >
          <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: '14px' }}>
            Category distribution
          </h3>
          <div>
            {categoryDist.map(([cat, count]) => {
              const status = getCategoryStatus(cat, count)
              const isWarn = status?.label === 'Below target'
              return (
                <div
                  key={cat}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 0',
                    borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', minWidth: '110px' }}>
                    {cat}
                  </span>
                  <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        borderRadius: '2px',
                        width: `${(count / maxCatCount) * 100}%`,
                        backgroundColor: isWarn ? '#EF9F27' : '#1D9E75',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', minWidth: '20px', textAlign: 'right' }}>
                    {count}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      minWidth: '70px',
                      textAlign: 'right',
                      color: status ? status.colour : 'rgba(255,255,255,0.2)',
                    }}
                  >
                    {status?.label ?? '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'amber'
}) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '6px',
        padding: '12px 14px',
      }}
    >
      <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>{label}</p>
      <p
        style={{
          fontSize: '22px',
          fontWeight: 500,
          color: accent === 'amber' ? '#EF9F27' : '#e8e8e6',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>{sub}</p>
      )}
    </div>
  )
}

function AttributeBar({ label, score }: { label: string; score: number }) {
  const clampedScore = Math.max(1, Math.min(10, Math.round(score)))
  const widthPercent = (clampedScore / 10) * 100

  let scoreColour: string
  if (clampedScore >= 7) scoreColour = '#1D9E75'
  else if (clampedScore >= 4) scoreColour = '#EF9F27'
  else scoreColour = '#D3202A'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 0',
        borderBottom: '0.5px solid rgba(255,255,255,0.04)',
      }}
    >
      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', minWidth: '90px' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            borderRadius: '2px',
            width: `${widthPercent}%`,
            backgroundColor: '#1D9E75',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span
        style={{
          fontSize: '12px',
          color: scoreColour,
          minWidth: '32px',
          textAlign: 'right',
        }}
      >
        {clampedScore}/10
      </span>
    </div>
  )
}

function ManaCurveChart({ buckets, maxBucket }: { buckets: number[]; maxBucket: number }) {
  const labels = ['1', '2', '3', '4', '5', '6+']
  const chartHeight = 80 // px

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: '6px', height: `${chartHeight + 20}px`, paddingBottom: '20px' }}>
      {buckets.map((count, i) => {
        const heightPercent = maxBucket > 0 ? (count / maxBucket) * 100 : 0
        const barHeight = Math.max(2, (heightPercent / 100) * chartHeight)

        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              height: '100%',
              justifyContent: 'flex-end',
            }}
          >
            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
              {count > 0 ? count : ''}
            </span>
            <div
              style={{
                width: '100%',
                height: `${barHeight}px`,
                borderRadius: '2px 2px 0 0',
                backgroundColor: '#1D9E75',
                opacity: count > 0 ? 1 : 0.2,
                minHeight: '2px',
              }}
              role="meter"
              aria-label={`CMC ${labels[i]}: ${count} cards`}
              aria-valuenow={count}
              aria-valuemin={0}
              aria-valuemax={maxBucket}
            />
            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>{labels[i]}</span>
          </div>
        )
      })}
      {/* Axis line */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: 0,
          right: 0,
          height: '0.5px',
          background: 'rgba(255,255,255,0.08)',
        }}
      />
    </div>
  )
}
