'use client'

import { useEffect } from 'react'
import { Sparkles, Crown } from 'lucide-react'
import { useOracle, useOracleContext } from '@/contexts/OracleContext'
import { CommanderBrowser } from '@/components/explore/CommanderBrowser'
import { SuggestedCommanders } from '@/components/explore/SuggestedCommanders'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Explore Page — Combined Forge + Exploration Landing
// ---------------------------------------------------------------------------

export default function ExplorePage() {
  const { open, isOpen, activeSession, messages } = useOracle()

  // Set Oracle context to exploration
  useOracleContext({ type: 'exploration' })

  // Auto-open sidebar when arriving at /explore with an active exploration session
  useEffect(() => {
    if (activeSession?.sessionType === 'exploration' && !isOpen) {
      open()
    }
  }, [activeSession, isOpen, open])

  // Extract suggested commanders from Oracle messages (if any)
  const suggestedCommanders = extractCommanderSuggestions(messages)
  const hasSuggestions = suggestedCommanders.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <header className="shrink-0 border-b border-border bg-sidebar px-6 py-4">
        <h1 className="text-xl font-semibold text-foreground">Explore</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Discover commanders and build new decks
        </p>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* Holding State or Suggested Commanders */}
        {hasSuggestions ? (
          <SuggestedCommanders commanders={suggestedCommanders} />
        ) : (
          <ExploreHoldingState />
        )}

        {/* Commander Browser Grid */}
        <section className="mt-6">
          <h2 className="text-lg font-medium text-foreground mb-4">
            Browse Commanders
          </h2>
          <CommanderBrowser />
        </section>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Holding State Component
// ---------------------------------------------------------------------------

function ExploreHoldingState() {
  const { open, isOpen } = useOracle()

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-6 text-center',
        'bg-surface rounded-xl border border-dashed border-border'
      )}
    >
      <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4">
        <Sparkles className="w-6 h-6 text-emerald-400 opacity-60" />
      </div>
      
      <h2 className="text-lg font-medium text-foreground mb-2">
        Start a conversation with Oracle
      </h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Tell Oracle what kind of deck you want to build, and I&apos;ll help you find the perfect commander.
      </p>

      {!isOpen && (
        <button
          onClick={open}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-emerald-500 text-white font-medium text-sm',
            'hover:bg-emerald-600 transition-colors'
          )}
        >
          <Sparkles className="w-4 h-4" />
          Open Oracle
        </button>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-6">
        <span className="h-px w-8 bg-border" />
        <span>or</span>
        <span className="h-px w-8 bg-border" />
      </div>

      <p className="text-sm text-muted-foreground mt-4">
        Browse commanders below
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper: Extract Commander Suggestions from Messages
// ---------------------------------------------------------------------------

interface SuggestedCommander {
  name: string
  colorIdentity: string[]
  artUrl?: string
  typeLine?: string
}

function extractCommanderSuggestions(messages: Array<{ role: string; content: string }>): SuggestedCommander[] {
  // Look for commander suggestions in assistant messages
  // Format: {{COMMANDER:name|colors|artUrl|typeLine}}
  const suggestions: SuggestedCommander[] = []
  const seen = new Set<string>()

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue

    const commanderPattern = /\{\{COMMANDER:([^|]+)\|([^|]*)\|([^|]*)\|([^}]*)\}\}/g
    let match

    while ((match = commanderPattern.exec(msg.content)) !== null) {
      const [, name, colors, artUrl, typeLine] = match
      if (seen.has(name)) continue
      seen.add(name)

      suggestions.push({
        name,
        colorIdentity: colors ? colors.split('') : [],
        artUrl: artUrl || undefined,
        typeLine: typeLine || undefined,
      })
    }
  }

  return suggestions
}
