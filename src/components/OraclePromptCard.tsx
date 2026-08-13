'use client'

import { useCallback } from 'react'
import { MessageCircle, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOracle } from '@/contexts/OracleContext'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OraclePromptCardProps {
  /** Custom title */
  title?: string
  /** Custom description */
  description?: string
  /** Custom button label */
  buttonLabel?: string
  /** Optional initial message to send when opening */
  initialMessage?: string
  /** Size variant */
  variant?: 'default' | 'compact'
}

// ---------------------------------------------------------------------------
// OraclePromptCard
// ---------------------------------------------------------------------------

/**
 * Styled card encouraging users to chat with the Oracle for commander recommendations.
 * Opens the Oracle sidebar when clicked.
 */
export function OraclePromptCard({
  title = "Not sure where to start?",
  description = "Chat with the Oracle to explore archetypes, themes, and find the perfect commander for your playstyle.",
  buttonLabel = "Ask the Oracle",
  initialMessage,
  variant = 'default',
}: OraclePromptCardProps) {
  const { open, setContext, sendMessage } = useOracle()
  
  const handleClick = useCallback(async () => {
    // Set context to commander-selection mode
    setContext({ type: 'exploration' })
    open()
    
    // Send initial message if provided
    if (initialMessage) {
      // Small delay to ensure sidebar is open
      setTimeout(() => {
        sendMessage(initialMessage)
      }, 100)
    }
  }, [open, setContext, sendMessage, initialMessage])

  if (variant === 'compact') {
    return (
      <button
        onClick={handleClick}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'bg-gradient-to-r from-amber-500/10 to-orange-500/10',
          'border border-amber-500/30 hover:border-amber-500/50',
          'transition-all hover:scale-[1.02]'
        )}
      >
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium text-amber-300">
          {buttonLabel}
        </span>
      </button>
    )
  }

  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl',
      'bg-gradient-to-br from-zinc-800/80 via-zinc-800/60 to-zinc-900/80',
      'border border-zinc-700/50',
      'p-6'
    )}>
      {/* Decorative gradient orb */}
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full bg-orange-500/10 blur-2xl" />
      
      <div className="relative z-10">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center mb-4">
          <MessageCircle className="w-6 h-6 text-amber-400" />
        </div>
        
        {/* Content */}
        <h3 className="text-lg font-semibold text-zinc-100 mb-2">
          {title}
        </h3>
        <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
          {description}
        </p>
        
        {/* CTA Button */}
        <button
          onClick={handleClick}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-gradient-to-r from-amber-500 to-orange-500',
            'text-white font-medium text-sm',
            'hover:from-amber-400 hover:to-orange-400',
            'transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/20',
            'focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-zinc-900'
          )}
        >
          <Sparkles className="w-4 h-4" />
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}
