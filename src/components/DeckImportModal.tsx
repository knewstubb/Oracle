'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, ChevronDown, Crown, Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import type { ImportMode } from '@/lib/deck-import'
import type { NormalizedDeck, NormalizedCard, CardsByType, CardTypeGroup } from '@/lib/deck-normalizer'

interface DeckImportModalProps {
  open: boolean
  onClose: () => void
  deck: NormalizedDeck | null
  cardsByType: CardsByType | null
}

interface ImportResponse {
  deckId: number
  allocationSummary: {
    assigned: number
    shortfall: number
    errors: string[]
  }
}

/** Order type groups are displayed in the modal */
const TYPE_GROUP_ORDER: CardTypeGroup[] = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
  'Other',
]

function CardRow({ card }: { card: NormalizedCard }) {
  return (
    <li className="flex items-center gap-1.5 py-0.5 text-[length:var(--fs-md)] text-muted-foreground">
      <span className="text-foreground">{card.quantity}×</span>
      <span>{card.cardName}</span>
      <span className="text-muted-foreground/60">({card.setCode})</span>
      {card.isProxy && (
        <Badge
          className="ml-1 bg-[var(--status-proxy)] text-white border-[var(--status-proxy)]"
        >
          Proxy
        </Badge>
      )}
    </li>
  )
}

function CommanderCard({ card }: { card: NormalizedCard }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
      <Crown className="size-4 shrink-0 text-amber-400" aria-hidden="true" />
      <div className="flex flex-1 items-center gap-1.5 text-[length:var(--fs-md)]">
        <span className="font-medium text-foreground">{card.cardName}</span>
        <span className="text-[length:var(--fs-md)] text-muted-foreground">({card.setCode})</span>
        {card.isProxy && (
          <Badge
            className="ml-1 bg-[var(--status-proxy)] text-white border-[var(--status-proxy)]"
          >
            Proxy
          </Badge>
        )}
      </div>
    </div>
  )
}

function TypeGroupSection({ type, cards }: { type: CardTypeGroup; cards: NormalizedCard[] }) {
  const totalQty = cards.reduce((sum, c) => sum + c.quantity, 0)

  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[length:var(--fs-md)] font-medium hover:bg-muted/30">
        <ChevronDown
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-0 -rotate-90"
          aria-hidden="true"
        />
        <span>{type}</span>
        <Badge variant="secondary" className="ml-auto text-[length:var(--fs-xs)]">
          {totalQty}
        </Badge>
      </summary>
      <div className="border-t border-border px-3 py-2">
        <ul className="space-y-0.5">
          {cards
            .sort((a, b) => a.cardName.localeCompare(b.cardName))
            .map((card) => (
              <CardRow key={`${card.scryfallId}-${card.cardName}`} card={card} />
            ))}
        </ul>
      </div>
    </details>
  )
}

export function DeckImportModal({
  open,
  onClose,
  deck,
  cardsByType,
}: DeckImportModalProps) {
  const [selectedMode, setSelectedMode] = useState<ImportMode>('existing_collection')
  const router = useRouter()
  const queryClient = useQueryClient()

  const importMutation = useMutation({
    mutationFn: async (mode: ImportMode): Promise<ImportResponse> => {
      const res = await fetch('/api/decks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deck, mode }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Deck import failed' }))
        const error = new Error(body.error ?? 'Deck import failed')
        // Attach status for retry logic
        ;(error as Error & { status?: number }).status = res.status
        throw error
      }

      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })

      // Show allocation warnings if present
      if (data.allocationSummary.errors.length > 0) {
        toast.warning('Deck imported with allocation warnings', {
          description: data.allocationSummary.errors.join('; '),
        })
        // Navigate with allocation errors encoded so the deck page can show the banner
        const errParam = encodeURIComponent(JSON.stringify(data.allocationSummary.errors))
        onClose()
        router.push(`/decks/${data.deckId}?allocationErrors=${errParam}&freshImport=true`)
      } else {
        toast.success('Deck imported successfully')
        onClose()
        router.push(`/decks/${data.deckId}?freshImport=true`)
      }
    },
  })

  // Check if the last error is retryable (500/502/504 — server-side transient failures)
  const importErrorStatus = importMutation.error
    ? (importMutation.error as Error & { status?: number }).status
    : null
  const isImportRetryable = importErrorStatus !== null && [500, 502, 504].includes(importErrorStatus ?? 0)

  const isImporting = importMutation.isPending

  if (!deck || !cardsByType) return null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !isImporting) onClose() }}>
      <DialogContent className="w-full max-w-[calc(100%-2rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {deck.name} — {deck.cardCount} cards
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable card list */}
        <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
          {/* Commander at top */}
          {deck.commander && (
            <CommanderCard card={deck.commander} />
          )}

          {/* Cards grouped by type */}
          {TYPE_GROUP_ORDER.map((type) => {
            const cards = cardsByType.groups[type]
            if (!cards || cards.length === 0) return null
            // Filter out commander from its type group to avoid duplication
            const nonCommanderCards = cards.filter((c) => !c.isCommander)
            if (nonCommanderCards.length === 0) return null
            return (
              <TypeGroupSection key={type} type={type} cards={nonCommanderCards} />
            )
          })}
        </div>

        {/* Import Mode Selection */}
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-[length:var(--fs-md)] font-medium text-foreground">Import Mode</p>
          <RadioGroup
            value={selectedMode}
            onValueChange={(val) => setSelectedMode(val as ImportMode)}
            disabled={isImporting}
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/30 has-[[data-checked]]:border-primary/50 has-[[data-checked]]:bg-primary/5">
              <RadioGroupItem value="existing_collection" className="mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-[length:var(--fs-md)] font-medium text-foreground">Use my existing collection</span>
                <p className="text-[length:var(--fs-md)] text-muted-foreground">Cards not in your collection will show as shortfall</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/30 has-[[data-checked]]:border-primary/50 has-[[data-checked]]:bg-primary/5">
              <RadioGroupItem value="add_new_cards" className="mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-[length:var(--fs-md)] font-medium text-foreground">Add as new cards (new purchase)</span>
                <p className="text-[length:var(--fs-md)] text-muted-foreground">Creates new copies for every card in the deck</p>
              </div>
            </label>
          </RadioGroup>
        </div>

        {/* Text Import Placeholder */}
        <div className="relative space-y-2 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <p className="text-[length:var(--fs-md)] font-medium text-muted-foreground">Text Import</p>
            <Badge variant="secondary" className="text-[length:var(--fs-xs)]">Coming Soon</Badge>
          </div>
          <Textarea
            disabled
            placeholder="Paste card list here..."
            className="min-h-[60px] resize-none border-dashed opacity-50"
            aria-label="Text import — coming soon"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {/* Import error display with retry for transient failures */}
          {importMutation.isError && (
            <div
              className="flex w-full items-center gap-2 rounded-md bg-destructive/10 px-3 py-2"
              aria-live="polite"
              role="alert"
            >
              <AlertCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
              <p className="flex-1 text-[length:var(--fs-md)] text-destructive">
                {importMutation.error.message || 'Failed to import deck'}
              </p>
              {isImportRetryable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto shrink-0 px-2 py-0.5 text-[length:var(--fs-md)] text-destructive hover:text-destructive"
                  onClick={() => importMutation.mutate(selectedMode)}
                >
                  <RefreshCw className="size-3" aria-hidden="true" />
                  Try Again
                </Button>
              )}
            </div>
          )}
          <Button variant="outline" onClick={onClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              importMutation.reset()
              importMutation.mutate(selectedMode)
            }}
            disabled={isImporting}
          >
            {isImporting && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            {isImporting ? 'Importing...' : 'Confirm Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
