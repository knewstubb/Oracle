'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Lightbulb, Sparkles, AlertTriangle, TrendingUp, DollarSign, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommanderInsight {
  id: string
  insightType: string
  content: string
  buildVariant: string | null
  archetype: string | null
  confidence: number
  cardMentions: string[]
  sourceType: string
  sourceUrl: string | null
  sourceTitle: string | null
  sourceAuthor: string | null
}

interface StrategyGuideProps {
  insights: CommanderInsight[]
  isLoading?: boolean
  selectedBuildLabel?: string | null
  commanderName?: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Display order and metadata for insight types */
const INSIGHT_TYPE_CONFIG: Record<string, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  priority: number
}> = {
  strategy: {
    label: 'Strategy Overview',
    icon: Lightbulb,
    description: 'How to pilot this commander',
    priority: 1,
  },
  synergy: {
    label: 'Key Synergies',
    icon: Zap,
    description: 'Cards that work well together',
    priority: 2,
  },
  card_recommendation: {
    label: 'Recommended Cards',
    icon: Sparkles,
    description: 'High-impact includes for this build',
    priority: 3,
  },
  budget_alternative: {
    label: 'Budget Alternatives',
    icon: DollarSign,
    description: 'Affordable swaps for expensive staples',
    priority: 4,
  },
  common_mistake: {
    label: 'Common Mistakes',
    icon: AlertTriangle,
    description: 'Pitfalls to avoid',
    priority: 5,
  },
  upgrade_path: {
    label: 'Upgrade Paths',
    icon: TrendingUp,
    description: 'Ways to improve the deck over time',
    priority: 6,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInsightTypeConfig(type: string) {
  return INSIGHT_TYPE_CONFIG[type] || {
    label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    icon: Lightbulb,
    description: '',
    priority: 99,
  }
}

/** Check if an insight is generic (not build-specific) */
function isGenericInsight(insight: CommanderInsight): boolean {
  return !insight.buildVariant && !insight.archetype
}

/** Group insights by type, sorted by priority */
function groupInsightsByType(insights: CommanderInsight[]): [string, CommanderInsight[]][] {
  const byType: Record<string, CommanderInsight[]> = {}
  
  for (const insight of insights) {
    if (!byType[insight.insightType]) {
      byType[insight.insightType] = []
    }
    byType[insight.insightType].push(insight)
  }
  
  // Sort by priority
  return Object.entries(byType).sort(([a], [b]) => {
    const priorityA = getInsightTypeConfig(a).priority
    const priorityB = getInsightTypeConfig(b).priority
    return priorityA - priorityB
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface InsightSectionProps {
  type: string
  insights: CommanderInsight[]
  defaultExpanded?: boolean
  selectedBuildLabel?: string | null
}

function InsightSection({ type, insights, defaultExpanded = false, selectedBuildLabel }: InsightSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const config = getInsightTypeConfig(type)
  const Icon = config.icon
  
  // Separate generic vs build-specific insights
  const genericInsights = insights.filter(isGenericInsight)
  const buildInsights = insights.filter(i => !isGenericInsight(i))
  
  // Show build-specific first if available, then generic
  const orderedInsights = [...buildInsights, ...genericInsights]
  
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '0.5px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <Icon className="size-4 shrink-0" style={{ color: '#1D9E75' }} />
        <div className="flex-1 text-left">
          <span className="text-[length:var(--fs-md)] font-medium">{config.label}</span>
          {config.description && (
            <span className="text-[length:var(--fs-sm)] text-muted-foreground ml-2">
              — {config.description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Show count badges */}
          {buildInsights.length > 0 && selectedBuildLabel && (
            <Badge
              className="text-[10px] px-1.5 py-0"
              style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}
            >
              {buildInsights.length} {selectedBuildLabel}
            </Badge>
          )}
          {genericInsights.length > 0 && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0"
            >
              {genericInsights.length} general
            </Badge>
          )}
          {isExpanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>
      
      {/* Content - collapsible */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {orderedInsights.map((insight, idx) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              isFirst={idx === 0}
              selectedBuildLabel={selectedBuildLabel}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface InsightCardProps {
  insight: CommanderInsight
  isFirst?: boolean
  selectedBuildLabel?: string | null
}

function InsightCard({ insight, isFirst, selectedBuildLabel }: InsightCardProps) {
  const isGeneric = isGenericInsight(insight)
  const buildLabel = insight.archetype || insight.buildVariant
  
  return (
    <div
      className={cn(
        'rounded-md px-3 py-2.5',
        // Build-specific insights get a subtle accent border
        !isGeneric && 'border-l-2'
      )}
      style={{
        background: isGeneric ? 'rgba(255,255,255,0.02)' : 'rgba(29,158,117,0.05)',
        border: isGeneric ? '0.5px solid rgba(255,255,255,0.04)' : undefined,
        borderLeftColor: !isGeneric ? '#1D9E75' : undefined,
      }}
    >
      {/* Build badge if not generic */}
      {!isGeneric && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <Badge
            className="text-[9px] px-1.5 py-0"
            style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}
          >
            {buildLabel}
          </Badge>
          {isFirst && selectedBuildLabel && (
            <span className="text-[10px] text-muted-foreground">
              — specific to your build
            </span>
          )}
        </div>
      )}
      
      {/* Content */}
      <p className="text-[length:var(--fs-md)] leading-relaxed">
        {insight.content}
      </p>
      
      {/* Card mentions */}
      {insight.cardMentions && insight.cardMentions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {insight.cardMentions.slice(0, 6).map(card => (
            <Badge
              key={card}
              variant="outline"
              className="text-[length:var(--fs-xs)] px-1.5 py-0 font-normal"
            >
              {card}
            </Badge>
          ))}
          {insight.cardMentions.length > 6 && (
            <span className="text-[length:var(--fs-xs)] text-muted-foreground self-center">
              +{insight.cardMentions.length - 6} more
            </span>
          )}
        </div>
      )}
      
      {/* Source attribution */}
      {insight.sourceTitle && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Source: {insight.sourceUrl ? (
            <a
              href={insight.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              {insight.sourceTitle}
            </a>
          ) : (
            insight.sourceTitle
          )}
          {insight.sourceAuthor && ` by ${insight.sourceAuthor}`}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StrategyGuide({
  insights,
  isLoading,
  selectedBuildLabel,
  commanderName,
}: StrategyGuideProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    )
  }
  
  if (!insights || insights.length === 0) {
    return (
      <div
        className="rounded-lg p-6 text-center"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '0.5px dashed rgba(255,255,255,0.15)',
        }}
      >
        <Lightbulb className="size-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-[length:var(--fs-md)] text-muted-foreground">
          No strategy insights available for {commanderName || 'this commander'} yet.
        </p>
        <p className="text-[length:var(--fs-sm)] text-muted-foreground mt-1">
          Check back later — we're adding more commander guides.
        </p>
      </div>
    )
  }
  
  const groupedInsights = groupInsightsByType(insights)
  
  // Count build-specific vs generic
  const buildSpecificCount = insights.filter(i => !isGenericInsight(i)).length
  const genericCount = insights.filter(isGenericInsight).length
  
  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center gap-2 text-[length:var(--fs-sm)] text-muted-foreground">
        <Lightbulb className="size-4" style={{ color: '#1D9E75' }} />
        <span>
          {insights.length} insights
          {selectedBuildLabel && buildSpecificCount > 0 && (
            <> — <span style={{ color: '#1D9E75' }}>{buildSpecificCount} for {selectedBuildLabel}</span></>
          )}
          {genericCount > 0 && buildSpecificCount > 0 && (
            <>, {genericCount} general</>
          )}
        </span>
      </div>
      
      {/* Insight sections */}
      <div className="space-y-2">
        {groupedInsights.map(([type, typeInsights], idx) => (
          <InsightSection
            key={type}
            type={type}
            insights={typeInsights}
            // Expand first section by default
            defaultExpanded={idx === 0}
            selectedBuildLabel={selectedBuildLabel}
          />
        ))}
      </div>
    </div>
  )
}
