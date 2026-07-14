'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  BookOpen,
  Check,
  GripVertical,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmationModal } from '@/components/ConfirmationModal'
import { PreconModTracker } from '@/components/PreconModTracker'
import type { DeckCard } from '@/components/CardGrid'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StrategyTabProps {
  deckId: number
  deckType: string | null // 'Precon Mod' or null
  commanderName: string | null
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
}

interface DeckDocumentation {
  deck_id: number
  strategy_playstyle: string | null
  synergy_lines: string | null
  strengths_weaknesses: string | null
  matchup_notes: string | null
  mulligan_guide: string | null
  updated_at: string
}

interface DeckNote {
  id: number
  deck_id: number
  content: string
  created_at: string
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

const DOCUMENTATION_SECTIONS: { key: keyof Pick<DeckDocumentation, 'strategy_playstyle' | 'synergy_lines' | 'strengths_weaknesses' | 'matchup_notes' | 'mulligan_guide'>; label: string }[] = [
  { key: 'strategy_playstyle', label: 'Strategy & Playstyle' },
  { key: 'synergy_lines', label: 'Key Synergy Lines' },
  { key: 'strengths_weaknesses', label: 'Strengths & Weaknesses' },
  { key: 'matchup_notes', label: 'Matchup Notes' },
  { key: 'mulligan_guide', label: 'Mulligan Guide' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePrimaryCategory(raw: string | null | undefined): string {
  if (!raw) return 'Other'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string')
      return parsed[0].replace(/\(top\)|\(bottom\)/gi, '').trim()
  } catch { /* */ }
  return raw.split(',')[0]?.trim().replace(/\(top\)|\(bottom\)/gi, '') || 'Other'
}

function deriveCategories(cards: DeckCard[]): CategoryInfo[] {
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
// Sub-components
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StrategyTab({ deckId, deckType, commanderName, cards }: StrategyTabProps) {
  const queryClient = useQueryClient()
  const [showSyncConfirm, setShowSyncConfirm] = useState(false)

  // Deck intent form state
  const [winCondition, setWinCondition] = useState('')
  const [tableContext, setTableContext] = useState('')
  const [bracket, setBracket] = useState<number | ''>('')
  const [budgetMode, setBudgetMode] = useState('')
  const [frustration, setFrustration] = useState('')
  const [formatType, setFormatType] = useState('')
  const [strategyNotes, setStrategyNotes] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Documentation inline editing state
  const [editingDocField, setEditingDocField] = useState<string | null>(null)
  const [editDocValue, setEditDocValue] = useState('')
  const [docSaveSuccess, setDocSaveSuccess] = useState<string | null>(null)

  // Fetch strategy data
  const { data: strategy, isLoading, error } = useQuery<StrategyData>({
    queryKey: ['decks', deckId, 'strategy'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/strategy`)
      if (!res.ok) throw new Error('Failed to load strategy')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Fetch documentation data
  const {
    data: documentationData,
    isLoading: isDocLoading,
    error: docError,
  } = useQuery<{ documentation: DeckDocumentation | null }>({
    queryKey: ['decks', deckId, 'documentation'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/documentation`)
      if (!res.ok) throw new Error('Failed to load documentation')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
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

  // Documentation save mutation
  const docMutation = useMutation({
    mutationFn: (fields: Record<string, string | null>) =>
      fetch(`/api/decks/${deckId}/documentation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      }).then(r => { if (!r.ok) throw new Error('Save failed'); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks', deckId, 'documentation'] })
      setDocSaveSuccess(editingDocField)
      setEditingDocField(null)
      setEditDocValue('')
      // Clear success indicator after 2 seconds
      setTimeout(() => setDocSaveSuccess(null), 2000)
    },
    onError: (err: Error) => {
      // Preserve the edit state so the user can retry
      toast.error(err.message || 'Failed to save documentation')
    },
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

  // Derive categories from cards
  const categories = useMemo(() => deriveCategories(cards), [cards])
  const overlaps = useMemo(() => detectOverlaps(categories), [categories])

  const isPreconMod = deckType === 'Precon Mod'

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
      {/* ─── Section 1: Precon mod tracker (conditional) ─────────────── */}
      {isPreconMod && (
        <PreconModTracker deckId={deckId} commanderName={commanderName ?? 'Commander'} />
      )}

      {/* ─── Section 2: Deck intent ─────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[length:var(--fs-md)] font-medium">Deck intent</h3>
          {!isEditing && strategy?.configured && (
            <Button variant="ghost" size="sm" onClick={startEditing}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
        </div>

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
      </section>

      {/* ─── Section 3: Category manager ────────────────────────────── */}
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
          {categories.map(cat => (
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

              {/* Count */}
              <span className="text-[length:var(--fs-sm)] text-muted-foreground tabular-nums">{cat.count}</span>

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
          ))}
        </div>
      </section>

      {/* ─── Section 4: Deck Documentation ──────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" style={{ color: '#1D9E75' }} />
          <h3 className="text-[length:var(--fs-md)] font-medium">Deck Documentation</h3>
        </div>

        {isDocLoading && (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        )}

        {docError && (
          <div className="flex items-center gap-2 p-3 rounded-md" style={{ background: 'rgba(239,68,68,0.05)', border: '0.5px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-[length:var(--fs-md)] text-destructive">Failed to load documentation</span>
          </div>
        )}

        {!isDocLoading && !docError && documentationData?.documentation === null && (
          <div
            className="rounded-lg p-6 text-center"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '0.5px dashed rgba(255,255,255,0.15)',
            }}
          >
            <p className="text-[length:var(--fs-md)] text-muted-foreground">
              No documentation generated yet.
            </p>
          </div>
        )}

        {!isDocLoading && !docError && documentationData?.documentation && (
          <div className="space-y-3">
            {DOCUMENTATION_SECTIONS.map(({ key, label }) => {
              const value = documentationData.documentation![key]
              const isEditingThis = editingDocField === key
              const justSaved = docSaveSuccess === key

              if (value === null && !isEditingThis) return null

              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-1">
                      {justSaved && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: '#1D9E75' }}>
                          <Check className="h-3 w-3" />
                          Saved
                        </span>
                      )}
                      {!isEditingThis && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[11px]"
                          onClick={() => {
                            setEditingDocField(key)
                            setEditDocValue(value ?? '')
                          }}
                        >
                          <Pencil className="h-3 w-3 mr-0.5" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>

                  {isEditingThis ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editDocValue}
                        onChange={e => setEditDocValue(e.target.value)}
                        rows={5}
                        style={fieldStyle}
                        className="text-[length:var(--fs-md)]"
                        placeholder={`Enter ${label.toLowerCase()}...`}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-[length:var(--fs-sm)] text-white hover:opacity-90"
                          style={{ background: '#1D9E75' }}
                          disabled={docMutation.isPending}
                          onClick={() => {
                            docMutation.mutate({ [key]: editDocValue || null })
                          }}
                        >
                          {docMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3 mr-1" />
                          )}
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[length:var(--fs-sm)]"
                          disabled={docMutation.isPending}
                          onClick={() => {
                            setEditingDocField(null)
                            setEditDocValue('')
                          }}
                        >
                          <X className="h-3 w-3 mr-0.5" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="rounded-md px-3 py-2 text-[length:var(--fs-md)] whitespace-pre-wrap"
                      style={fieldStyle}
                    >
                      {value}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

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
