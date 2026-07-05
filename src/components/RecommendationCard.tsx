'use client'

import { Check, ArrowDown, SkipForward, MessageCircle, Minus, Plus } from 'lucide-react'
import { OwnershipBadge, type OwnershipStatus } from './OwnershipBadge'
import type { Recommendation } from '@/lib/debrief-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecommendationCardProps {
  recommendation: Recommendation
  onAction: (actionType: 'applied' | 'skipped' | 'disagreed') => void
  isLoading: boolean
  index: number
  total: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecommendationCard({
  recommendation,
  onAction,
  isLoading,
  index,
  total,
}: RecommendationCardProps) {
  const { cutCard, addCard, reason, ownershipStatus } = recommendation

  return (
    <div
      className="w-full max-w-[95%]"
      role="article"
      aria-label={`Recommendation ${index} of ${total}: Cut ${cutCard}, Add ${addCard}`}
    >
      <div
        className="overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '0.5px solid var(--border-emphasis)',
          borderRadius: 'var(--border-radius-lg)',
        }}
      >
        {/* Header — Priority/Index */}
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderBottom: '0.5px solid var(--border-emphasis)' }}
        >
          <span className="text-xs font-medium text-white/60">
            Highest impact change
          </span>
          <span className="text-xs font-medium text-white/40">
            Fix {index} of {total}
          </span>
        </div>

        {/* Cut Section */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Minus className="size-3.5 shrink-0" style={{ color: '#E24B4A' }} aria-hidden="true" />
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: '#E24B4A' }}>
              Cut
            </span>
          </div>
          <p className="text-[13px] font-medium text-white/90 line-through decoration-white/30">
            {cutCard}
          </p>
          <p className="mt-1 text-xs text-white/50 leading-relaxed">
            {reason}
          </p>
        </div>

        {/* Arrow Separator */}
        <div className="flex items-center justify-center py-1.5" style={{ borderTop: '0.5px solid var(--border-emphasis)', borderBottom: '0.5px solid var(--border-emphasis)' }}>
          <ArrowDown className="size-3.5 text-white/30" aria-hidden="true" />
        </div>

        {/* Add Section */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Plus className="size-3.5 shrink-0" style={{ color: '#1D9E75' }} aria-hidden="true" />
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: '#1D9E75' }}>
              Add
            </span>
          </div>
          <p className="text-[13px] font-medium text-white/90">
            {addCard}
          </p>
          <p className="mt-1 text-xs text-white/50 leading-relaxed">
            {reason}
          </p>
          <div className="mt-2">
            <OwnershipBadge status={ownershipStatus as OwnershipStatus} />
          </div>
        </div>

        {/* Action Buttons */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderTop: '0.5px solid var(--border-emphasis)' }}
        >
          {/* Make this change — teal primary */}
          <button
            onClick={() => onAction('applied')}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#1D9E75' }}
            aria-label="Make this change"
          >
            <Check className="size-3.5" aria-hidden="true" />
            Make this change
          </button>

          {/* Skip — neutral secondary */}
          <button
            onClick={() => onAction('skipped')}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white/70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', border: '0.5px solid rgba(255, 255, 255, 0.1)' }}
            aria-label="Skip this recommendation"
          >
            <SkipForward className="size-3.5" aria-hidden="true" />
            Skip
          </button>

          {/* Disagree — tertiary, right-aligned */}
          <button
            onClick={() => onAction('disagreed')}
            disabled={isLoading}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-white/40 transition-colors hover:text-white/60 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Disagree with this recommendation"
          >
            <MessageCircle className="size-3" aria-hidden="true" />
            Disagree
          </button>
        </div>
      </div>
    </div>
  )
}
