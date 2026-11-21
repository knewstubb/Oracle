'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ChevronDown,
  GripVertical,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
  edhrecThemeSlug: string | null
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

  // Build selector state - initialized from prop
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(buildId)

  // Sync selectedBuildId when buildId prop changes (e.g., on navigation)
  // Adjust state during render rather than in an effect.
  const [prevBuildId, setPrevBuildId] = useState(buildId)
  if (buildId !== prevBuildId) {
    setPrevBuildId(buildId)
    setSelectedBuildId(buildId)
  }

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
  const builds = buildsData?.builds
  const selectedBuild = useMemo(() => {
    if (!builds || !selectedBuildId) return null
    return builds.find(b => b.id === selectedBuildId) ?? null
  }, [builds, selectedBuildId])

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
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6 p-4 mx-auto max-w-[var(--content-max-width)]">
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
                style={{ background: 'rgba(113,56,204,0.1)', color: 'var(--accent-primary-text)' }}
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
                style={{ color: 'var(--accent-primary-text)' }}
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
                    <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(113,56,204,0.6)' }} />
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
                      style={{ background: 'rgba(113,56,204,0.1)', color: 'var(--accent-primary-text)' }}
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

      {/* ─── Section 5: Notes ───────────────────────────────────────── */}
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

const fieldStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
}
