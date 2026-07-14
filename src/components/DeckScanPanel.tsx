'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CardPopover } from '@/components/CardPopover'
import type { DeckCard } from '@/components/CardGrid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Combo {
  cards: string[]
  result: string
}

interface ScanResult {
  strategy: string
  winConditions: string[]
  combos: Combo[]
  strengths: string[]
  weaknesses: string[]
  bracket: string
  commanderName: string
}

interface DeckScanPanelProps {
  deckId: number
  commanderName: string
  cards: DeckCard[]
}

type ScanState = 'idle' | 'scanning' | 'success' | 'error'

// ---------------------------------------------------------------------------
// Progress steps
// ---------------------------------------------------------------------------

const SCAN_STEPS = [
  'Analyzing card synergies...',
  'Detecting combos...',
  'Assessing power level...',
] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeckScanPanel({ deckId, commanderName, cards }: DeckScanPanelProps) {
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [currentStep, setCurrentStep] = useState(0)

  const cardLookup = buildCardLookup(cards)

  const mutation = useMutation({
    mutationFn: async () => {
      setScanState('scanning')
      setCurrentStep(0)
      setErrorMessage('')

      // Simulate step progress while the real request runs
      const stepInterval = setInterval(() => {
        setCurrentStep((prev) => Math.min(prev + 1, SCAN_STEPS.length - 1))
      }, 2000)

      try {
        const res = await fetch('/api/ai/deck-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckId }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Analysis failed')
        }
        return data as ScanResult
      } finally {
        clearInterval(stepInterval)
      }
    },
    onSuccess: (data) => {
      setCurrentStep(SCAN_STEPS.length)
      setResult(data)
      setScanState('success')
    },
    onError: (err: Error) => {
      setErrorMessage(err.message)
      setScanState('error')
    },
  })

  const handleScan = () => mutation.mutate()

  // ---- Idle state ----
  if (scanState === 'idle') {
    return (
      <div className="mx-auto max-w-[800px]">
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Sparkles className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-[length:var(--fs-md)] text-muted-foreground">
            Run a scan to analyze this deck&apos;s strategy, combos, and power level.
          </p>
          <Button onClick={handleScan}>
            <Sparkles className="size-4" aria-hidden="true" data-icon="inline-start" />
            Scan Deck
          </Button>
        </div>
      </div>
    )
  }

  // ---- Scanning state ----
  if (scanState === 'scanning') {
    return (
      <div className="mx-auto max-w-[800px]">
        <div className="flex flex-col items-center gap-6 py-16" aria-live="polite">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
          <ul className="space-y-3" role="list" aria-label="Analysis progress">
            {SCAN_STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-2 text-[length:var(--fs-md)]">
                {i < currentStep ? (
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                ) : i === currentStep ? (
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                ) : (
                  <div className="size-4 rounded-full border border-muted-foreground/30" aria-hidden="true" />
                )}
                <span className={i <= currentStep ? 'text-foreground' : 'text-muted-foreground'}>
                  {step}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  // ---- Error state ----
  if (scanState === 'error') {
    return (
      <div className="mx-auto max-w-[800px]">
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-[length:var(--fs-md)] text-destructive"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Analysis failed: {errorMessage}</span>
          <Button variant="destructive" size="sm" onClick={handleScan}>
            <RefreshCw className="size-3.5" aria-hidden="true" data-icon="inline-start" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // ---- Success state ----
  if (!result) return null

  return (
    <div className="mx-auto max-w-[800px] space-y-8 pb-12" role="region" aria-label="Deck scan results" aria-live="polite">
      {/* Strategy Summary */}
      <section>
        <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Strategy</h2>
        <p className="text-[length:var(--fs-md)] leading-relaxed text-muted-foreground">
          {result.strategy}
        </p>
      </section>

      {/* Win Conditions */}
      {result.winConditions.length > 0 && (
        <section>
          <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Win Conditions</h2>
          <ul className="space-y-2">
            {result.winConditions.map((wc, i) => (
              <li key={i} className="text-[length:var(--fs-md)] leading-relaxed text-muted-foreground">
                <CardTextWithPopovers text={wc} cardLookup={cardLookup} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Combos */}
      {result.combos.length > 0 && (
        <section>
          <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Combos</h2>
          <div className="space-y-4">
            {result.combos.map((combo, i) => (
              <ComboGroup key={i} combo={combo} cardLookup={cardLookup} />
            ))}
          </div>
        </section>
      )}

      {/* Strengths */}
      {result.strengths.length > 0 && (
        <section>
          <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Strengths</h2>
          <ul className="space-y-2">
            {result.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[length:var(--fs-md)]">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
                <span className="text-muted-foreground">
                  <CardTextWithPopovers text={s} cardLookup={cardLookup} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Weaknesses */}
      {result.weaknesses.length > 0 && (
        <section>
          <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Weaknesses</h2>
          <ul className="space-y-2">
            {result.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-[length:var(--fs-md)]">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                <span className="text-muted-foreground">
                  <CardTextWithPopovers text={w} cardLookup={cardLookup} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Power Level / Bracket */}
      {result.bracket && (
        <section>
          <h2 className="mb-3 text-[length:var(--fs-lg)] font-medium">Power Level</h2>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-[length:var(--fs-md)]">
              {result.bracket}
            </Badge>
          </div>
        </section>
      )}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Helper: card name lookup from deck cards
// ---------------------------------------------------------------------------

type CardLookupMap = Map<string, DeckCard>

function buildCardLookup(cards: DeckCard[]): CardLookupMap {
  const map = new Map<string, DeckCard>()
  for (const card of cards) {
    map.set(card.card_name.toLowerCase(), card)
  }
  return map
}

// ---------------------------------------------------------------------------
// Helper: Combo card group with small images
// ---------------------------------------------------------------------------

function ComboGroup({ combo, cardLookup }: { combo: Combo; cardLookup: CardLookupMap }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-2 flex flex-wrap gap-2">
        {combo.cards.map((cardName) => {
          const card = cardLookup.get(cardName.toLowerCase())
          if (card) {
            return (
              <CardPopover
                key={cardName}
                cardName={card.card_name}
                scryfallId={card.scryfall_id}
                setCode={card.set_code}
                tags={card.tags}
              >
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[length:var(--fs-sm)] font-medium text-foreground transition-colors hover:bg-muted/80 cursor-pointer"
                  role="link"
                  aria-label={`View ${cardName}`}
                >
                  {card.scryfall_id && (
                    <img
                      src={getScryfallSmallUrl(card.scryfall_id)}
                      alt=""
                      className="size-6 rounded object-cover"
                      loading="lazy"
                    />
                  )}
                  {cardName}
                </span>
              </CardPopover>
            )
          }
          return (
            <span
              key={cardName}
              className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-[length:var(--fs-sm)] font-medium text-foreground"
            >
              {cardName}
            </span>
          )
        })}
      </div>
      {combo.result && (
        <p className="text-[length:var(--fs-sm)] text-muted-foreground">{combo.result}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper: Render text with card names as clickable popovers
// ---------------------------------------------------------------------------

function CardTextWithPopovers({
  text,
  cardLookup,
}: {
  text: string
  cardLookup: CardLookupMap
}) {
  if (!text) return null

  // Build a regex from all card names in the deck (sorted longest first to avoid partial matches)
  const cardNames = Array.from(cardLookup.keys()).sort((a, b) => b.length - a.length)
  if (cardNames.length === 0) return <>{text}</>

  const escapedNames = cardNames.map((n) => escapeRegex(n))
  const pattern = new RegExp(`(${escapedNames.join('|')})`, 'gi')

  const parts = text.split(pattern)

  return (
    <>
      {parts.map((part, i) => {
        const card = cardLookup.get(part.toLowerCase())
        if (card) {
          return (
            <CardPopover
              key={`${part}-${i}`}
              cardName={card.card_name}
              scryfallId={card.scryfall_id}
              setCode={card.set_code}
              tags={card.tags}
            >
              <span
                className="inline text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:decoration-primary cursor-pointer"
                role="link"
                aria-label={`View ${card.card_name}`}
              >
                {part}
              </span>
            </CardPopover>
          )
        }
        return <span key={`${part}-${i}`}>{part}</span>
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function getScryfallSmallUrl(scryfallId: string): string {
  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  return `https://cards.scryfall.io/small/front/${a}/${b}/${scryfallId}.jpg`
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
