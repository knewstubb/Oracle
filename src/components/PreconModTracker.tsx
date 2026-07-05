'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Lock,
  Shield,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { computeTradeDown, budgetColour } from '@/lib/precon-mod-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreconModTrackerProps {
  deckId: number
  commanderName: string
}

interface PreconModStateResponse {
  swaps_used: number
  sol_ring_removed: boolean
  rarity_mythic_used: number
  rarity_rare_used: number
  rarity_uncommon_used: number
  rarity_common_used: number
  budget_spent: number
  budget_cap: number
  trade_down: {
    mythic_total: number
    rare_total: number
    uncommon_total: number
    common_total: number
  }
  updated_at: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreconModTracker({ deckId, commanderName }: PreconModTrackerProps) {
  const [rulesExpanded, setRulesExpanded] = useState(false)

  const { data: state, isLoading, error } = useQuery<PreconModStateResponse>({
    queryKey: ['decks', deckId, 'precon-mod-state'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/precon-mod-state`)
      if (!res.ok) throw new Error('Failed to load precon mod state')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Loading state
  if (isLoading) {
    return (
      <div
        className="rounded-lg p-4 space-y-4"
        style={{
          background: 'rgba(239,159,39,0.08)',
          border: '0.5px solid rgba(239,159,39,0.25)',
        }}
      >
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#EF9F27]" />
          <span className="text-sm font-medium">Precon mod tracker</span>
        </div>
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    )
  }

  // Error state
  if (error || !state) {
    return (
      <div
        className="rounded-lg p-4 space-y-2"
        style={{
          background: 'rgba(239,159,39,0.08)',
          border: '0.5px solid rgba(239,159,39,0.25)',
        }}
      >
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#EF9F27]" />
          <span className="text-sm font-medium">Precon mod tracker</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" />
          <span className="text-xs">State not yet computed</span>
        </div>
      </div>
    )
  }

  // Compute trade-down totals (use API response or compute client-side)
  const tradeDown = state.trade_down ?? computeTradeDown(state)
  const budgetPercent = (state.budget_spent / state.budget_cap) * 100
  const colour = budgetColour(state.budget_spent, state.budget_cap)

  const colourMap = {
    teal: '#1D9E75',
    amber: '#EF9F27',
    red: '#E24B4A',
  }

  return (
    <div
      className="rounded-lg p-4 space-y-4"
      style={{
        background: 'rgba(239,159,39,0.08)',
        border: '0.5px solid rgba(239,159,39,0.25)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-[#EF9F27]" />
        <span className="text-sm font-medium">Precon mod tracker</span>
        <Badge
          className="text-xs"
          style={{ background: 'rgba(239,159,39,0.15)', color: '#EF9F27' }}
        >
          {commanderName}
        </Badge>
      </div>

      {/* ── Violation warning ──────────────────────────────────────────── */}
      {state.swaps_used > 10 && (
        <div
          className="flex items-center gap-2 rounded-md px-3 py-2"
          style={{
            background: 'rgba(226,75,74,0.12)',
            border: '0.5px solid rgba(226,75,74,0.4)',
          }}
        >
          <AlertCircle className="h-3.5 w-3.5 text-[#E24B4A]" />
          <span className="text-xs text-[#E24B4A] font-medium">
            Swap limit exceeded — {state.swaps_used} of 10 swaps used
          </span>
        </div>
      )}

      {/* ── Swap pips row ──────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Swaps used</span>
          <span className="text-xs font-medium ml-auto">
            {state.swaps_used} of 10 used
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: 10 }, (_, i) => {
            if (i === 0) {
              // Pip 1 — always locked amber (Sol Ring mandatory)
              return (
                <div
                  key={i}
                  className="flex items-center justify-center rounded-[3px]"
                  style={{
                    width: 18,
                    height: 18,
                    background: 'rgba(239,159,39,0.3)',
                    border: '0.5px solid rgba(239,159,39,0.6)',
                  }}
                  title="Sol Ring — mandatory swap"
                >
                  <Lock className="h-2.5 w-2.5 text-[#EF9F27]" />
                </div>
              )
            }
            const isUsed = i < state.swaps_used
            return (
              <div
                key={i}
                className="rounded-[3px]"
                style={{
                  width: 18,
                  height: 18,
                  background: isUsed ? '#1D9E75' : 'rgba(255,255,255,0.04)',
                  border: isUsed ? 'none' : '0.5px solid rgba(255,255,255,0.1)',
                }}
              />
            )
          })}
        </div>
      </div>

      {/* ── Rarity budget grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Mythic', used: state.rarity_mythic_used, total: tradeDown.mythic_total, isMythic: true },
          { label: 'Rare', used: state.rarity_rare_used, total: tradeDown.rare_total, isMythic: false },
          { label: 'Uncommon', used: state.rarity_uncommon_used, total: tradeDown.uncommon_total, isMythic: false },
          { label: 'Common', used: state.rarity_common_used, total: tradeDown.common_total, isMythic: false },
        ].map(slot => (
          <div
            key={slot.label}
            className="space-y-1 rounded-md p-1.5"
            style={{
              background: 'rgba(255,255,255,0.04)',
            }}
          >
            <span className="text-[10px] text-muted-foreground">{slot.label}</span>
            <div className="flex items-center gap-0.5">
              {Array.from({ length: slot.total }, (_, i) => (
                <div
                  key={i}
                  className="rounded-[2px]"
                  style={{
                    width: 10,
                    height: 10,
                    background: i < slot.used
                      ? (slot.isMythic ? '#EF9F27' : '#1D9E75')
                      : 'rgba(255,255,255,0.1)',
                  }}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {slot.total - slot.used} remaining
            </span>
          </div>
        ))}
      </div>

      {/* ── Budget progress bar ────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Budget</span>
          <span className="text-xs font-medium">
            ${state.budget_spent.toFixed(2)} of ${state.budget_cap}
          </span>
        </div>
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(budgetPercent, 100)}%`,
              background: colourMap[colour],
            }}
          />
        </div>
      </div>

      {/* ── Sol Ring confirmation row ──────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center rounded-sm"
          style={{
            width: 16,
            height: 16,
            background: state.sol_ring_removed ? '#1D9E75' : 'rgba(255,255,255,0.06)',
            border: state.sol_ring_removed ? 'none' : '0.5px solid rgba(255,255,255,0.1)',
          }}
        >
          {state.sol_ring_removed && <Check className="h-3 w-3 text-white" />}
        </div>
        <span className="text-xs text-muted-foreground">
          Sol Ring removed — mandatory swap completed counts as swap 1
        </span>
      </div>

      {/* ── Pod rules (collapsible) ────────────────────────────────────── */}
      <div className="space-y-1">
        <button
          onClick={() => setRulesExpanded(!rulesExpanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {rulesExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Pod rules
        </button>
        {rulesExpanded && (
          <ul className="text-[11px] text-muted-foreground space-y-1 pl-4 list-disc">
            <li>Maximum 10 card replacements total</li>
            <li>Sol Ring must be removed (mandatory swap — counts toward the 10)</li>
            <li>Rarity budget: 1 Mythic / 2 Rare / 3 Uncommon / 4 Common (higher slots trade down to lower rarity)</li>
            <li>Total added card value not exceeding $50</li>
          </ul>
        )}
      </div>
    </div>
  )
}
