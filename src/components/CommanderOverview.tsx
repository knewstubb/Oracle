'use client'

import { Lightbulb, Zap, Sparkles, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { CommanderInsight } from '@/components/StrategyGuide'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommanderBuild {
  id: string
  archetype: string | null
  theme: string | null
  edhrecThemeSlug: string
  deckCount: number
  deckPercentage: number
}

interface CommanderOverviewProps {
  commanderName: string | null
  colorIdentity: string | null
  builds: CommanderBuild[]
  generalInsights: CommanderInsight[]
  isLoading?: boolean
  selectedBuildId: string | null
  onBuildSelect: (buildId: string | null) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLOR_IDENTITY_LABELS: Record<string, { name: string; colors: string[] }> = {
  W: { name: 'White', colors: ['#F8F6D8'] },
  U: { name: 'Blue', colors: ['#0E68AB'] },
  B: { name: 'Black', colors: ['#150B00'] },
  R: { name: 'Red', colors: ['#D3202A'] },
  G: { name: 'Green', colors: ['#00733E'] },
  WU: { name: 'Azorius', colors: ['#F8F6D8', '#0E68AB'] },
  WB: { name: 'Orzhov', colors: ['#F8F6D8', '#150B00'] },
  WR: { name: 'Boros', colors: ['#F8F6D8', '#D3202A'] },
  WG: { name: 'Selesnya', colors: ['#F8F6D8', '#00733E'] },
  UB: { name: 'Dimir', colors: ['#0E68AB', '#150B00'] },
  UR: { name: 'Izzet', colors: ['#0E68AB', '#D3202A'] },
  UG: { name: 'Simic', colors: ['#0E68AB', '#00733E'] },
  BR: { name: 'Rakdos', colors: ['#150B00', '#D3202A'] },
  BG: { name: 'Golgari', colors: ['#150B00', '#00733E'] },
  RG: { name: 'Gruul', colors: ['#D3202A', '#00733E'] },
  WUB: { name: 'Esper', colors: ['#F8F6D8', '#0E68AB', '#150B00'] },
  WUR: { name: 'Jeskai', colors: ['#F8F6D8', '#0E68AB', '#D3202A'] },
  WUG: { name: 'Bant', colors: ['#F8F6D8', '#0E68AB', '#00733E'] },
  WBR: { name: 'Mardu', colors: ['#F8F6D8', '#150B00', '#D3202A'] },
  WBG: { name: 'Abzan', colors: ['#F8F6D8', '#150B00', '#00733E'] },
  WRG: { name: 'Naya', colors: ['#F8F6D8', '#D3202A', '#00733E'] },
  UBR: { name: 'Grixis', colors: ['#0E68AB', '#150B00', '#D3202A'] },
  UBG: { name: 'Sultai', colors: ['#0E68AB', '#150B00', '#00733E'] },
  URG: { name: 'Temur', colors: ['#0E68AB', '#D3202A', '#00733E'] },
  BRG: { name: 'Jund', colors: ['#150B00', '#D3202A', '#00733E'] },
  WUBR: { name: 'Artifice', colors: ['#F8F6D8', '#0E68AB', '#150B00', '#D3202A'] },
  WUBG: { name: 'Witch', colors: ['#F8F6D8', '#0E68AB', '#150B00', '#00733E'] },
  WURG: { name: 'Ink', colors: ['#F8F6D8', '#0E68AB', '#D3202A', '#00733E'] },
  WBRG: { name: 'Dune', colors: ['#F8F6D8', '#150B00', '#D3202A', '#00733E'] },
  UBRG: { name: 'Glint', colors: ['#0E68AB', '#150B00', '#D3202A', '#00733E'] },
  WUBRG: { name: 'Five Color', colors: ['#F8F6D8', '#0E68AB', '#150B00', '#D3202A', '#00733E'] },
  C: { name: 'Colorless', colors: ['#B5A99B'] },
}

const INSIGHT_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  strategy: Lightbulb,
  synergy: Zap,
  card_recommendation: Sparkles,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getColorIdentityInfo(identity: string | null) {
  if (!identity) return { name: 'Unknown', colors: ['#666'] }
  const normalized = identity.toUpperCase().replace(/[^WUBRGC]/g, '')
  return COLOR_IDENTITY_LABELS[normalized] || { name: identity, colors: ['#666'] }
}

function formatBuildLabel(build: CommanderBuild): string {
  if (build.archetype && build.theme) {
    return `${capitalize(build.archetype)} / ${capitalize(build.theme)}`
  }
  if (build.archetype) return capitalize(build.archetype)
  if (build.theme) return capitalize(build.theme)
  return 'General'
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ColorPips({ colors }: { colors: string[] }) {
  return (
    <div className="flex gap-0.5">
      {colors.map((color, i) => (
        <div
          key={i}
          className="size-4 rounded-full border border-white/20"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  )
}

function BuildChip({
  build,
  isSelected,
  onSelect,
}: {
  build: CommanderBuild
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[length:var(--fs-sm)] transition-colors"
      style={{
        background: isSelected ? 'rgba(29,158,117,0.15)' : 'rgba(255,255,255,0.03)',
        border: isSelected ? '1px solid rgba(29,158,117,0.4)' : '1px solid rgba(255,255,255,0.06)',
        color: isSelected ? '#1D9E75' : 'inherit',
      }}
    >
      <span className="font-medium">{formatBuildLabel(build)}</span>
      <span className="text-muted-foreground text-[length:var(--fs-xs)]">
        {build.deckCount.toLocaleString()} decks
      </span>
    </button>
  )
}

function InsightSummary({ insight }: { insight: CommanderInsight }) {
  const Icon = INSIGHT_TYPE_ICONS[insight.insightType] || Lightbulb
  
  return (
    <div
      className="rounded-md px-3 py-2.5"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '0.5px solid rgba(255,255,255,0.04)',
      }}
    >
      <div className="flex items-start gap-2">
        <Icon className="size-4 mt-0.5 shrink-0" style={{ color: '#1D9E75' }} />
        <div className="flex-1 min-w-0">
          <p className="text-[length:var(--fs-md)] leading-relaxed">
            {insight.content}
          </p>
          {insight.cardMentions && insight.cardMentions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {insight.cardMentions.slice(0, 5).map(card => (
                <Badge
                  key={card}
                  variant="outline"
                  className="text-[length:var(--fs-xs)] px-1.5 py-0 font-normal"
                >
                  {card}
                </Badge>
              ))}
              {insight.cardMentions.length > 5 && (
                <span className="text-[length:var(--fs-xs)] text-muted-foreground self-center">
                  +{insight.cardMentions.length - 5} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CommanderOverview({
  commanderName,
  colorIdentity,
  builds,
  generalInsights,
  isLoading,
  selectedBuildId,
  onBuildSelect,
}: CommanderOverviewProps) {
  const colorInfo = getColorIdentityInfo(colorIdentity)
  
  // Get strategy insight for the main description
  const strategyInsight = generalInsights.find(i => i.insightType === 'strategy')
  const otherInsights = generalInsights.filter(i => i.insightType !== 'strategy')
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>
    )
  }
  
  return (
    <section className="space-y-4">
      {/* Header: Commander name + color identity */}
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-[length:var(--fs-lg)] font-semibold">{commanderName}</h3>
        <div className="flex items-center gap-1.5">
          <ColorPips colors={colorInfo.colors} />
          <span className="text-[length:var(--fs-sm)] text-muted-foreground">
            {colorInfo.name}
          </span>
        </div>
      </div>
      
      {/* Strategy overview (if available) */}
      {strategyInsight && (
        <div
          className="rounded-lg px-4 py-3"
          style={{
            background: 'rgba(29,158,117,0.05)',
            border: '1px solid rgba(29,158,117,0.15)',
          }}
        >
          <p className="text-[length:var(--fs-md)] leading-relaxed">
            {strategyInsight.content}
          </p>
        </div>
      )}
      
      {/* Other general insights */}
      {otherInsights.length > 0 && (
        <div className="space-y-2">
          {otherInsights.map(insight => (
            <InsightSummary key={insight.id} insight={insight} />
          ))}
        </div>
      )}
      
      {/* Available builds */}
      {builds.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <span className="text-[length:var(--fs-sm)] text-muted-foreground">
              Popular builds ({builds.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {builds.map(build => (
              <BuildChip
                key={build.id}
                build={build}
                isSelected={selectedBuildId === build.id}
                onSelect={() => onBuildSelect(selectedBuildId === build.id ? null : build.id)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {!strategyInsight && otherInsights.length === 0 && (
        <div
          className="rounded-lg p-4 text-center"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '0.5px dashed rgba(255,255,255,0.15)',
          }}
        >
          <Lightbulb className="size-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-[length:var(--fs-sm)] text-muted-foreground">
            No overview available for {commanderName || 'this commander'} yet.
          </p>
        </div>
      )}
    </section>
  )
}
