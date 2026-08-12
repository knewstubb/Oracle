'use client'

import { useEffect } from 'react'
import { Compass } from 'lucide-react'
import { useOracle, useOracleContext } from '@/contexts/OracleContext'

// ---------------------------------------------------------------------------
// Explore Page — Oracle-centric exploration for deck ideas
// ---------------------------------------------------------------------------

export default function ExplorePage() {
  const { open, isOpen } = useOracle()
  
  // Set exploration context for Oracle
  useOracleContext({ type: 'exploration' })

  // Auto-open Oracle sidebar when entering explore page
  useEffect(() => {
    if (!isOpen) {
      open()
    }
  }, [open, isOpen])

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      {/* Hero section */}
      <div className="max-w-lg text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mx-auto mb-6">
          <Compass className="w-8 h-8 text-amber-400" />
        </div>
        
        <h1 className="text-2xl font-semibold text-zinc-100 mb-3">
          Explore Deck Ideas
        </h1>
        
        <p className="text-zinc-400 mb-8 leading-relaxed">
          Tell Oracle what kind of deck you want to build. Describe a strategy, 
          theme, or playstyle — Oracle will help you find the perfect commander 
          and build a deck around it.
        </p>

        {/* Suggestion chips */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          <SuggestionChip text="I want to build aristocrats" />
          <SuggestionChip text="Something that plays differently each game" />
          <SuggestionChip text="A political deck for multiplayer" />
          <SuggestionChip text="Fast aggro for bracket 2" />
        </div>

        {/* Keyboard hint */}
        <p className="text-xs text-zinc-600">
          Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">⌘⇧O</kbd> to toggle Oracle anytime
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SuggestionChip — clickable prompt suggestion
// ---------------------------------------------------------------------------

function SuggestionChip({ text }: { text: string }) {
  const { sendMessage, open, isOpen } = useOracle()

  const handleClick = () => {
    if (!isOpen) open()
    sendMessage(text)
  }

  return (
    <button
      onClick={handleClick}
      className="px-3 py-1.5 text-sm text-zinc-400 bg-zinc-800/50 hover:bg-zinc-800 hover:text-zinc-200 rounded-full transition-colors"
    >
      {text}
    </button>
  )
}
