'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { StrategyGuide } from '@/components/StrategyGuide'
import { CommanderOverview } from '@/components/CommanderOverview'
import type { DeckCard } from '@/components/CardGrid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StrategyTabProps {
  deckId: number
  deckType: string | null // 'Precon Mod' or null
  commanderName: string | null
  commanderId: string | null
  buildId: string | null
  cards: DeckCard[]
}

interface StrategyData {
  configured: boolean
  win_condition: string | null
  table_context: string | null
  bracket: number | null
  budget_mode: string | null
  budget_ceiling: number | null
  frustration: string | null
  strategy_notes: string | null
  format_rules: unknown
  updated_at?: string | null
}

interface CategoryInfo {
  name: string
  count: number
  isCore: boolean
  cards: string[]
  recommended?: number | null // From build averages
}

interface DeckNote {
  id: number
  deck_id: number
  content: string
  created_at: string
}

// Commander Builds types
interface CommanderBuild {
  id: string
  archetype: string | null
  theme: string | null
  edhrecThemeSlug: string
  deckCount: number
  deckPercentage: number
  avgLands: number | null
  avgRamp: number | null
  avgDraw: number | null
  avgRemoval: number | null
  avgWipes: number | null
  avgCreatures: number | null
  avgArtifacts: number | null
  avgEnchantments: number | null
  avgInstants: number | null
  avgSorceries: number | null
  avgPlaneswalkers: number | null
}

interface BuildsResponse {
  commanderId: string
  commanderName: string
  colorIdentity: string
  builds: CommanderBuild[]
  count: number
}

// Commander Insights types
interface CommanderInsight {
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

interface InsightsResponse {
  commanderId: string
  commanderName: string
  insights: CommanderInsight[]
  byType: Record<string, CommanderInsight[]>
  filters: { archetype: string | null; buildVariant: string | null; generalOnly?: boolean }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORE_CATEGORIES = ['Ramp', 'Draw', 'Removal', 'Lands', 'Win Condition']

const BRACKET_OPTIONS = [
  { value: 1, label: '1 — Casual / Precon' },
  { value: 2, label: '2 — Focused' },
  { value: 3, label: '3 — Optimised' },
  { value: 4, label: '4 — Competitive' },
]

const BUDGET_MODE_OPTIONS = [
  { value: 'collection', label: 'Collection Only' },
  { value: 'budget', label: 'Budget' },
  { value: 'unrestricted', label: 'Unrestricted' },
]

const FORMAT_TYPE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'precon_mod', label: 'Precon Mod' },
  { value: 'baggy_league', label: 'Baggy League' },
  { value: 'custom', label: 'Custom' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a build's archetype + theme into a display label */
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

/** Map core category names to build avg fields */
function getRecommendedForCategory(
  categoryName: string,
  build: CommanderBuild | null
): number | null {
  if (!build) return null
  const map: Record<string, number | null> = {
    'Ramp': build.avgRamp,
    'Draw': build.avgDraw,
    'Removal': build.avgRemoval,
    'Lands': build.avgLands,
    'Win Condition': null, // No avg for this
  }
  return map[categoryName] ?? null
}

function parsePrimaryCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string')
      return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
  } catch { /* */ }
  return raw.split(',')[0]?.trim().replace(/\(top\)|\(bottom\)/gi, '') || 'Other'
}

function detectOverlaps(categories: CategoryInfo[]): Record<string, string> {
  const overlaps: Record<string, string> = {}

  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      const a = categories[i]
      const b = categories[j]
      if (a.cards.length === 0 || b.cards.length === 0) continue

      const shared = a.cards.filter(card => b.cards.includes(card))
      const smallerCount = Math.min(a.cards.length, b.cards.length)

      if (smallerCount > 0 && shared.length / smallerCount > 0.5) {
        // Newer one (later in array) gets the warning
        overlaps[b.name] = a.name
      }
    }
  }

  return overlaps
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StrategyTab({ deckId, deckType, commanderName, commanderId, buildId, cards }: StrategyTabProps) {
  const queryClient = useQueryClient()
  const [showSyncConfirm, setShowSyncConfirm] = useState(false)
  const [isDeckIntentExpanded, setIsDeckIntentExpanded] = useState(false)

  // Build selector state - initialized from prop
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(buildId)

  // Sync selectedBuildId when buildId prop changes (e.g., on navigation)
  useEffect(() => {
    setSelectedBuildId(buildId)
  }, [buildId])

  // Deck intent form state
  const [winCondition, setWinCondition] = useState('')
  const [tableContext, setTableContext] = useState('')
  const [bracket, setBracket] = useState<number | ''>('')
  const [budgetMode, setBudgetMode] = useState('')
  const [frustration, setFrustration] = useState('')
  const [formatType, setFormatType] = useState('')
  const [strategyNotes, setStrategyNotes] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Fetch strategy data (deck intent)
  const { data: strategy, isLoading, error } = useQuery<StrategyData>({
    queryKey: ['decks', deckId, 'strategy'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/strategy`)
      if (!res.ok) throw new Error('Failed to load strategy')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Fetch commander builds (only if we have a commanderId)
  const { data: buildsData, isLoading: isBuildsLoading } = useQuery<BuildsResponse>({
    queryKey: ['commanders', commanderId, 'builds'],
    queryFn: async () => {
      const res = await fetch(`/api/commanders/${commanderId}/builds`)
      if (!res.ok) throw new Error('Failed to load builds')
      return res.json()
    },
    enabled: !!commanderId,
    staleTime: 10 * 60 * 1000,
  })

  // Get the selected build object
  const selectedBuild = useMemo(() => {
    if (!buildsData?.builds || !selectedBuildId) return null
    return buildsData.builds.find(b => b.id === selectedBuildId) ?? null
  }, [buildsData?.builds, selectedBuildId])

  // Fetch GENERAL commander insights (for overview section)
  const { data: generalInsightsData, isLoading: isGeneralInsightsLoading } = useQuery<InsightsResponse>({
    queryKey: ['commanders', commanderId, 'insights', 'general'],
    queryFn: async () => {
      const url = `/api/commanders/${commanderId}/insights?general=true`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load general insights')
      return res.json()
    },
    enabled: !!commanderId,
    staleTime: 10 * 60 * 1000,
  })

  // Fetch BUILD-SPECIFIC insights (filtered by selected build's archetype/theme)
  const { data: buildInsightsData, isLoading: isBuildInsightsLoading } = useQuery<InsightsResponse>({
    queryKey: ['commanders', commanderId, 'insights', selectedBuild?.archetype, selectedBuild?.theme],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedBuild?.archetype) params.set('archetype', selectedBuild.archetype)
      if (selectedBuild?.theme) params.set('build_variant', selectedBuild.theme)
      const url = `/api/commanders/${commanderId}/insights${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load build insights')
      return res.json()
    },
    enabled: !!commanderId && !!selectedBuildId,
    staleTime: 10 * 60 * 1000,
  })

  // Fetch notes data
  const {
    data: notesData,
    isLoading: isNotesLoading,
    error: notesError,
  } = useQuery<{ notes: DeckNote[] }>({
    queryKey: ['decks', deckId, 'notes'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/notes`)
      if (!res.ok) throw new Error('Failed to load notes')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(`/api/decks/${deckId}/strategy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to save strategy')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'strategy'] })
      toast.success('Strategy saved')
      setIsEditing(false)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Save build_id mutation
  const saveBuildMutation = useMutation({
    mutationFn: async (newBuildId: string | null) => {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ build_id: newBuildId }),
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to save build type')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId] })
      toast.success('Build type saved')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Handle build selection change (from CommanderOverview chips or dropdown)
  function handleBuildChange(newBuildId: string | null) {
    setSelectedBuildId(newBuildId)
    saveBuildMutation.mutate(newBuildId)
  }

  // Populate form from fetched data
  function startEditing() {
    if (strategy) {
      setWinCondition(strategy.win_condition || '')
      setTableContext(strategy.table_context || '')
      setBracket(strategy.bracket || '')
      setBudgetMode(strategy.budget_mode || '')
      setFrustration(strategy.frustration || '')
      setStrategyNotes(strategy.strategy_notes || '')
      setFormatType(
        strategy.format_rules &&
        typeof strategy.format_rules === 'object' &&
        'format_name' in (strategy.format_rules as Record<string, unknown>)
          ? ((strategy.format_rules as Record<string, unknown>).format_name as string)
          : 'none'
      )
    }
    setIsEditing(true)
    setIsDeckIntentExpanded(true)
  }

  function handleSave() {
    saveMutation.mutate({
      win_condition: winCondition || null,
      table_context: tableContext || null,
      bracket: bracket || null,
      budget_mode: budgetMode || null,
      frustration: frustration || null,
      strategy_notes: strategyNotes || null,
      format_rules: formatType !== 'none' ? { format_name: formatType } : null,
    })
  }

  // Derive categories from cards with recommended counts from build
  const categories = useMemo(() => {
    const groups: Record<string, string[]> = {}

    for (const card of cards) {
      const cat = parsePrimaryCategory(card.categories)
      if (cat === 'Maybeboard' || cat === 'Sideboard') continue
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(card.card_name)
    }

    const result: CategoryInfo[] = []

    // Core categories first
    for (const coreName of CORE_CATEGORIES) {
      const matchKey = Object.keys(groups).find(
        k => k.toLowerCase() === coreName.toLowerCase() ||
             k.toLowerCase().startsWith(coreName.toLowerCase().split(' ')[0])
      )
      result.push({
        name: coreName,
        count: matchKey ? groups[matchKey].length : 0,
        isCore: true,
        cards: matchKey ? groups[matchKey] : [],
        recommended: getRecommendedForCategory(coreName, selectedBuild),
      })
      if (matchKey) delete groups[matchKey]
    }

    // Custom categories (remaining)
    const sortedCustom = Object.entries(groups).sort(([, a], [, b]) => b.length - a.length)
    for (const [name, catCards] of sortedCustom) {
      result.push({
        name,
        count: catCards.length,
        isCore: false,
        cards: catCards,
      })
    }

    return result
  }, [cards, selectedBuild])
  const overlaps = useMemo(() => detectOverlaps(categories), [categories])

  // -------------------------------------------------------------------------
  // Loading / Error states
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 max-w-4xl mx-auto">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span className="text-[length:var(--fs-md)]">Failed to load strategy data</span>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6 p-4 max-w-4xl mx-auto">
      {/* ─── Section 1: Commander Overview (Build-Independent) ──────── */}
      {commanderId && (
        <CommanderOverview
          commanderName={commanderName}
          commanderId={commanderId}
          colorIdentity={buildsData?.colorIdentity || null}
          builds={buildsData?.builds || []}
          generalInsights={generalInsightsData?.insights || []}
          isLoading={isBuildsLoading || isGeneralInsightsLoading}
          selectedBuildId={selectedBuildId}
          onBuildSelect={handleBuildChange}
        />
      )}

      {/* ─── Section 2: Build Selector (if not already selected via chips) ─── */}
      {commanderId && buildsData && buildsData.builds.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={selectedBuildId || ''}
                onChange={e => handleBuildChange(e.target.value === '' ? null : e.target.value)}
                disabled={saveBuildMutation.isPending}
                className="h-9 w-64 rounded-md px-3 py-1 pr-8 text-[length:var(--fs-md)] appearance-none cursor-pointer"
                style={fieldStyle}
              >
                <option value="">General (no specific build)</option>
                {buildsData.builds.map(build => (
                  <option key={build.id} value={build.id}>
                    {formatBuildLabel(build)} ({build.deckCount.toLocaleString()} decks)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-muted-foreground" />
            </div>
            {saveBuildMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {selectedBuild && (
              <span className="text-[length:var(--fs-sm)] text-muted-foreground">
                {selectedBuild.deckPercentage.toFixed(1)}% of {commanderName} decks
              </span>
            )}
          </div>
        </section>
      )}

      {/* ─── Section 3: Build-Specific Strategy Guide ──────────────── */}
      {commanderId && selectedBuildId && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[length:var(--fs-md)] font-medium">
              {selectedBuild ? formatBuildLabel(selectedBuild) : 'Build'} Strategy
            </h3>
            {selectedBuild && (
              <Badge
                variant="secondary"
                className="text-[length:var(--fs-xs)] px-1.5 py-0"
                style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}
              >
                {selectedBuild.deckCount.toLocaleString()} decks
              </Badge>
            )}
          </div>

          <StrategyGuide
            insights={buildInsightsData?.insights || []}
            isLoading={isBuildInsightsLoading}
            selectedBuildLabel={selectedBuild ? formatBuildLabel(selectedBuild) : null}
            commanderName={commanderName}
          />
        </section>
      )}

      {/* ─── Section 4: Category manager ────────────────────────────── */}
      {selectedBuildId && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[length:var(--fs-md)] font-medium">Categories</h3>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-[length:var(--fs-sm)]"
                style={{ color: '#1D9E75' }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add category
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-[length:var(--fs-sm)]"
                onClick={() => setShowSyncConfirm(true)}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Sync to Archidekt
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            {categories.map(cat => {
              // Determine if count is below or above recommended
              const diff = cat.recommended != null ? cat.count - Math.round(cat.recommended) : null
              const isLow = diff != null && diff < 0
              const isHigh = diff != null && diff > 2

              return (
                <div
                  key={cat.name}
                  className="flex items-center gap-2 px-3 py-2 rounded-md"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '0.5px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {/* Drag handle or lock icon */}
                  {cat.isCore ? (
                    <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(29,158,117,0.6)' }} />
                  ) : (
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground cursor-grab" />
                  )}

                  {/* Name */}
                  <span className="text-[length:var(--fs-md)] flex-1">{cat.name}</span>

                  {/* Count with recommended comparison */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[length:var(--fs-sm)] tabular-nums"
                      style={{
                        color: isLow ? '#EF9F27' : isHigh ? '#3B82F6' : 'inherit',
                      }}
                    >
                      {cat.count}
                    </span>
                    {cat.recommended != null && (
                      <span className="text-[length:var(--fs-xs)] text-muted-foreground tabular-nums">
                        / {Math.round(cat.recommended)}
                      </span>
                    )}
                  </div>

                  {/* Badge */}
                  {cat.isCore ? (
                    <Badge
                      variant="secondary"
                      className="text-[length:var(--fs-xs)] px-1.5 py-0"
                      style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}
                    >
                      Core
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[length:var(--fs-xs)] px-1.5 py-0">
                      Custom
                    </Badge>
                  )}

                  {/* Low/High warning */}
                  {isLow && (
                    <Badge
                      className="text-[length:var(--fs-xs)] px-1.5 py-0"
                      style={{ background: 'rgba(239,159,39,0.15)', color: '#EF9F27' }}
                    >
                      {Math.abs(diff!)} below avg
                    </Badge>
                  )}
                  {isHigh && (
                    <Badge
                      className="text-[length:var(--fs-xs)] px-1.5 py-0"
                      style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}
                    >
                      +{diff} above avg
                    </Badge>
                  )}

                  {/* Overlap warning */}
                  {overlaps[cat.name] && (
                    <Badge
                      className="text-[length:var(--fs-xs)] px-1.5 py-0"
                      style={{ background: 'rgba(239,159,39,0.15)', color: '#EF9F27' }}
                    >
                      Overlaps with {overlaps[cat.name]}
                    </Badge>
                  )}

                  {/* Actions for custom categories */}
                  {!cat.isCore && (
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        className="p-0.5 rounded hover:bg-white/5"
                        title="Edit category"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        className="p-0.5 rounded hover:bg-white/5"
                        title="Delete category"
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ─── Section 5: Deck intent (collapsible) ───────────────────── */}
      <section className="space-y-3">
        <button
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setIsDeckIntentExpanded(!isDeckIntentExpanded)}
        >
          {isDeckIntentExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <h3 className="text-[length:var(--fs-md)] font-medium">Deck Intent</h3>
          {!isDeckIntentExpanded && strategy?.configured && (
            <Badge variant="secondary" className="text-[length:var(--fs-xs)] px-1.5 py-0">
              Configured
            </Badge>
          )}
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={(e) => {
                e.stopPropagation()
                startEditing()
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              {strategy?.configured ? 'Edit' : 'Configure'}
            </Button>
          )}
        </button>

        {isDeckIntentExpanded && (
          <div className="pl-6 space-y-4">
            {!isEditing && !strategy?.configured && (
              <div
                className="rounded-lg p-6 text-center"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '0.5px dashed rgba(255,255,255,0.15)',
                }}
              >
                <p className="text-[length:var(--fs-md)] text-muted-foreground mb-3">
                  Configure your deck&apos;s strategic intent to drive personalised recommendations.
                </p>
                <Button size="sm" onClick={startEditing}>
                  Configure Strategy
                </Button>
              </div>
            )}

            {!isEditing && strategy?.configured && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {strategy.win_condition && (
                  <FieldDisplay label="Win condition" value={strategy.win_condition} fullWidth />
                )}
                {strategy.bracket && (
                  <FieldDisplay
                    label="Bracket"
                    value={BRACKET_OPTIONS.find(b => b.value === strategy.bracket)?.label || String(strategy.bracket)}
                  />
                )}
                {strategy.table_context && (
                  <FieldDisplay label="Table context" value={strategy.table_context} />
                )}
                {strategy.frustration && (
                  <FieldDisplay label="Frustrations" value={strategy.frustration} />
                )}
                {strategy.budget_mode && (
                  <FieldDisplay
                    label="Budget mode"
                    value={BUDGET_MODE_OPTIONS.find(b => b.value === strategy.budget_mode)?.label || strategy.budget_mode}
                  />
                )}
                {strategy.format_rules != null && typeof strategy.format_rules === 'object' ? (
                  <FieldDisplay
                    label="Format type"
                    value={
                      FORMAT_TYPE_OPTIONS.find(
                        f => f.value === String((strategy.format_rules as Record<string, string>)?.format_name ?? '')
                      )?.label || 'Custom'
                    }
                  />
                ) : null}
                {strategy.strategy_notes && (
                  <FieldDisplay label="Strategy notes" value={strategy.strategy_notes} fullWidth />
                )}
              </div>
            )}

            {isEditing && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Row 1 */}
                  <FieldInput label="Win condition" fullWidth>
                    <Textarea
                      value={winCondition}
                      onChange={e => setWinCondition(e.target.value)}
                      placeholder="How does this deck win?"
                      rows={2}
                      className="field-input"
                      style={fieldStyle}
                    />
                  </FieldInput>
                  <FieldInput label="Bracket">
                    <select
                      value={bracket}
                      onChange={e => setBracket(e.target.value ? Number(e.target.value) : '')}
                      className="h-9 w-full rounded-md px-3 py-1 text-[length:var(--fs-md)]"
                      style={fieldStyle}
                    >
                      <option value="">Select bracket...</option>
                      {BRACKET_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </FieldInput>

                  {/* Row 2 */}
                  <FieldInput label="Table context">
                    <Textarea
                      value={tableContext}
                      onChange={e => setTableContext(e.target.value)}
                      placeholder="Describe your playgroup or meta"
                      rows={2}
                      style={fieldStyle}
                    />
                  </FieldInput>
                  <FieldInput label="Frustrations">
                    <Textarea
                      value={frustration}
                      onChange={e => setFrustration(e.target.value)}
                      placeholder="What problems need solving?"
                      rows={2}
                      style={fieldStyle}
                    />
                  </FieldInput>

                  {/* Row 3 */}
                  <FieldInput label="Budget mode">
                    <select
                      value={budgetMode}
                      onChange={e => setBudgetMode(e.target.value)}
                      className="h-9 w-full rounded-md px-3 py-1 text-[length:var(--fs-md)]"
                      style={fieldStyle}
                    >
                      <option value="">Select budget mode...</option>
                      {BUDGET_MODE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </FieldInput>
                  <FieldInput label="Format type">
                    <select
                      value={formatType}
                      onChange={e => setFormatType(e.target.value)}
                      className="h-9 w-full rounded-md px-3 py-1 text-[length:var(--fs-md)]"
                      style={fieldStyle}
                    >
                      {FORMAT_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </FieldInput>

                  {/* Row 4 */}
                  <FieldInput label="Strategy notes" fullWidth>
                    <Textarea
                      value={strategyNotes}
                      onChange={e => setStrategyNotes(e.target.value)}
                      placeholder="Any other context about how you want to play this deck"
                      rows={3}
                      style={fieldStyle}
                    />
                  </FieldInput>
                </div>

                {/* Save button */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    style={{ background: '#1D9E75' }}
                    className="text-white hover:opacity-90"
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1" />
                    )}
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(false)}
                    disabled={saveMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─── Section 6: Notes ───────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-[length:var(--fs-md)] font-medium">Notes</h3>

        {isNotesLoading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        )}

        {notesError && (
          <div className="flex items-center gap-2 p-3 rounded-md" style={{ background: 'rgba(239,68,68,0.05)', border: '0.5px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-[length:var(--fs-md)] text-destructive">Failed to load notes</span>
          </div>
        )}

        {!isNotesLoading && !notesError && notesData?.notes.length === 0 && (
          <p className="text-[length:var(--fs-md)] text-muted-foreground">No notes yet.</p>
        )}

        {!isNotesLoading && !notesError && notesData && notesData.notes.length > 0 && (
          <div className="space-y-2">
            {notesData.notes.map((note) => (
              <div
                key={note.id}
                className="rounded-md px-3 py-2"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '0.5px solid rgba(255,255,255,0.06)',
                }}
              >
                <span className="text-[length:var(--fs-xs)] text-muted-foreground block mb-1">
                  {new Date(note.created_at).toLocaleString()}
                </span>
                <p className="text-[length:var(--fs-md)] whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Sync Confirmation Dialog ───────────────────────────────── */}
      <ConfirmationModal
        open={showSyncConfirm}
        onConfirm={() => {
          setShowSyncConfirm(false)
          toast.success('Categories synced to Archidekt')
        }}
        onCancel={() => setShowSyncConfirm(false)}
        title="Sync categories to Archidekt?"
        description="This will push your current category assignments to Archidekt. Existing Archidekt categories will be overwritten."
        confirmLabel="Sync"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field display helpers
// ---------------------------------------------------------------------------

const fieldStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
}

function FieldDisplay({
  label,
  value,
  fullWidth,
}: {
  label: string
  value: string
  fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <span className="text-[11px] text-muted-foreground block mb-0.5">{label}</span>
      <div
        className="rounded-md px-3 py-2 text-[length:var(--fs-md)]"
        style={fieldStyle}
      >
        {value}
      </div>
    </div>
  )
}

function FieldInput({
  label,
  children,
  fullWidth,
}: {
  label: string
  children: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <label className="text-[11px] text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  )
}
