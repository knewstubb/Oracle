'use client'

import { Check, ArrowDown, SkipForward, MessageCircle, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
          <span className="text-[length:var(--fs-sm)] font-medium text-white/60">
            Highest impact change
          </span>
          <span className="text-[length:var(--fs-sm)] font-medium text-white/40">
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
          <p className="mt-1 text-[length:var(--fs-sm)] text-white/50 leading-relaxed">
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
          <p className="mt-1 text-[length:var(--fs-sm)] text-white/50 leading-relaxed">
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
          <Button
            size="sm"
            onClick={() => onAction('applied')}
            disabled={isLoading}
            className="text-white"
            style={{ backgroundColor: '#1D9E75' }}
            aria-label="Make this change"
          >
            <Check className="size-3.5" aria-hidden="true" />
            Make this change
          </Button>

          {/* Skip — neutral secondary */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction('skipped')}
            disabled={isLoading}
            className="text-white/70"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', borderColor: 'rgba(255, 255, 255, 0.1)' }}
            aria-label="Skip this recommendation"
          >
            <SkipForward className="size-3.5" aria-hidden="true" />
            Skip
          </Button>

          {/* Disagree — tertiary, right-aligned */}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onAction('disagreed')}
            disabled={isLoading}
            className="ml-auto text-white/40 hover:text-white/60"
            aria-label="Disagree with this recommendation"
          >
            <MessageCircle className="size-3" aria-hidden="true" />
            Disagree
          </Button>
        </div>
      </div>
    </div>
  )
}
