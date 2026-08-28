'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Crown, Sparkles } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CardImage } from '@/components/CardImage'
import { ColourPips } from '@/components/ColourPips'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuggestedCommander {
  name: string
  colorIdentity: string[]
  artUrl?: string
  typeLine?: string
}

interface SuggestedCommandersProps {
  commanders: SuggestedCommander[]
}

// ---------------------------------------------------------------------------
// SuggestedCommanders Component
// ---------------------------------------------------------------------------

export function SuggestedCommanders({ commanders }: SuggestedCommandersProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const handleCommit = useCallback(async (commander: SuggestedCommander) => {
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${commander.name} Deck`,
          format: 'commander',
          commanderName: commander.name,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create deck')
      }

      const data = await res.json()
      const deckId = data.deck?.id ?? data.id

      toast.success(`Created deck for ${commander.name}`)
      queryClient.invalidateQueries({ queryKey: ['decks'] })

      if (deckId) {
        router.push(`/decks/${deckId}`)
      }
    } catch (err) {
      console.error('[SuggestedCommanders] Failed to create deck:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to create deck')
    }
  }, [queryClient, router])

  if (commanders.length === 0) return null

  return (
    <section
      className={cn(
        'rounded-xl p-4 mb-6',
        'bg-emerald-500/10 border border-emerald-500/30'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-medium text-foreground">
            Oracle Suggestions
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {commanders.length} commander{commanders.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Horizontal Scroll Row */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
        {commanders.map((commander) => (
          <CommanderSuggestionCard
            key={commander.name}
            commander={commander}
            onCommit={() => handleCommit(commander)}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// CommanderSuggestionCard
// ---------------------------------------------------------------------------

interface CommanderSuggestionCardProps {
  commander: SuggestedCommander
  onCommit: () => void
}

function CommanderSuggestionCard({ commander, onCommit }: CommanderSuggestionCardProps) {
  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-lg min-w-[280px] max-w-[320px]',
        'bg-surface border border-border',
        'hover:border-emerald-500/50 transition-colors'
      )}
    >
      {/* Card Image */}
      <div className="shrink-0 w-[60px] h-[84px] rounded overflow-hidden bg-zinc-800">
        <CardImage
          cardName={commander.name}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 min-w-0">
        <h3 className="text-sm font-medium text-foreground truncate">
          {commander.name}
        </h3>

        {/* Color Identity */}
        {commander.colorIdentity.length > 0 && (
          <div className="mt-1">
            <ColourPips colours={commander.colorIdentity} size={14} />
          </div>
        )}

        {/* Type Line */}
        {commander.typeLine && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {commander.typeLine}
          </p>
        )}

        {/* Commit Button */}
        <button
          onClick={onCommit}
          className={cn(
            'mt-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md',
            'bg-emerald-500 text-white text-xs font-medium',
            'hover:bg-emerald-600 transition-colors',
            'self-start'
          )}
        >
          <Crown className="w-3 h-3" />
          Start Deck
        </button>
      </div>
    </div>
  )
}
