'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Edit2, Loader2, Save, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormatRulesPreconMod {
  format_name: 'precon_mod'
  swap_limit: number
  mandatory_cuts: string[]
  rarity_budget: { mythic: number; rare: number; uncommon: number; common: number }
  value_cap: number
  precon_url: string
}

interface FormatRulesBaggyLeague {
  format_name: 'baggy_league'
  rarity_restriction: 'common' | 'uncommon' | 'rare' | 'mythic'
  progression_level: number
  progression_points: number
}

interface FormatRulesCustom {
  format_name: 'custom'
  description: string
  constraints: string[]
}

type FormatRules = FormatRulesPreconMod | FormatRulesBaggyLeague | FormatRulesCustom | null

interface StrategyData {
  configured: boolean
  win_condition: string | null
  table_context: string | null
  bracket: number | null
  budget_mode: string | null
  budget_ceiling: number | null
  frustration: string | null
  strategy_notes: string | null
  format_rules: FormatRules
  updated_at?: string | null
}

interface StrategyCanvasProps {
  deckId: number
  deckType?: string
}

type CanvasState = 'onboarding' | 'editing' | 'viewing'
type FormatType = 'none' | 'precon_mod' | 'baggy_league' | 'custom'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFormatType(rules: FormatRules): FormatType {
  if (!rules) return 'none'
  return rules.format_name as FormatType
}

function buildDefaultFormatRules(formatType: FormatType): FormatRules {
  switch (formatType) {
    case 'precon_mod':
      return {
        format_name: 'precon_mod',
        swap_limit: 10,
        mandatory_cuts: ['Sol Ring'],
        rarity_budget: { mythic: 1, rare: 2, uncommon: 3, common: 4 },
        value_cap: 50.0,
        precon_url: '',
      }
    case 'baggy_league':
      return {
        format_name: 'baggy_league',
        rarity_restriction: 'common',
        progression_level: 1,
        progression_points: 0,
      }
    case 'custom':
      return {
        format_name: 'custom',
        description: '',
        constraints: [],
      }
    default:
      return null
  }
}

const BUDGET_MODE_LABELS: Record<string, string> = {
  collection: 'Collection Only',
  budget: 'Budget',
  unrestricted: 'Unrestricted',
}

const BRACKET_LABELS: Record<number, string> = {
  1: '1 — Casual / Precon',
  2: '2 — Focused',
  3: '3 — Optimised',
  4: '4 — Competitive',
}

const RARITY_OPTIONS = ['common', 'uncommon', 'rare', 'mythic'] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StrategyCanvas({ deckId, deckType }: StrategyCanvasProps) {
  const queryClient = useQueryClient()

  // Form state
  const [winCondition, setWinCondition] = useState('')
  const [tableContext, setTableContext] = useState('')
  const [bracket, setBracket] = useState<number | ''>('')
  const [budgetMode, setBudgetMode] = useState<string>('')
  const [budgetCeiling, setBudgetCeiling] = useState<number | ''>('')
  const [formatType, setFormatType] = useState<FormatType>('none')
  const [formatRules, setFormatRules] = useState<FormatRules>(null)
  const [frustration, setFrustration] = useState('')
  const [strategyNotes, setStrategyNotes] = useState('')
  const [canvasState, setCanvasState] = useState<CanvasState>('onboarding')

  // Fetch strategy data
  const { data, isLoading, error } = useQuery<StrategyData>({
    queryKey: ['decks', deckId, 'strategy'],
    queryFn: async () => {
      const res = await fetch(`/api/decks/${deckId}/strategy`)
      if (!res.ok) throw new Error('Failed to load strategy')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Determine canvas state from fetched data
  const effectiveState = (() => {
    if (canvasState === 'editing') return 'editing'
    if (!data) return 'onboarding'
    if (data.configured) return canvasState === 'onboarding' ? 'viewing' : canvasState
    return 'onboarding'
  })()

  // Mutation for saving strategy
  const mutation = useMutation({
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
      setCanvasState('viewing')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Populate form fields from data
  function populateForm(strategyData: StrategyData) {
    setWinCondition(strategyData.win_condition || '')
    setTableContext(strategyData.table_context || '')
    setBracket(strategyData.bracket || '')
    setBudgetMode(strategyData.budget_mode || '')
    setBudgetCeiling(strategyData.budget_ceiling || '')
    setFrustration(strategyData.frustration || '')
    setStrategyNotes(strategyData.strategy_notes || '')
    const ft = getFormatType(strategyData.format_rules)
    setFormatType(ft)
    setFormatRules(strategyData.format_rules)
  }

  function handleStartEditing() {
    if (data) populateForm(data)
    setCanvasState('editing')
  }

  function handleStartOnboarding() {
    // Reset form to defaults
    setWinCondition('')
    setTableContext('')
    setBracket('')
    setBudgetMode('')
    setBudgetCeiling('')
    setFrustration('')
    setStrategyNotes('')
    setFormatType('none')
    setFormatRules(null)
    setCanvasState('editing')
  }

  function handleFormatTypeChange(newType: FormatType) {
    setFormatType(newType)
    setFormatRules(buildDefaultFormatRules(newType))
  }

  function handleSubmit() {
    const payload: Record<string, unknown> = {
      win_condition: winCondition || null,
      table_context: tableContext || null,
      bracket: bracket || null,
      budget_mode: budgetMode || null,
      budget_ceiling: budgetMode === 'budget' ? (budgetCeiling || null) : null,
      frustration: frustration || null,
      strategy_notes: strategyNotes || null,
      format_rules: formatRules,
    }
    mutation.mutate(payload)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-8 w-32" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span className="text-[length:var(--fs-md)]">Failed to load strategy data</span>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Onboarding state
  // -------------------------------------------------------------------------
  if (effectiveState === 'onboarding') {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-6 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
        <h3 className="text-[length:var(--fs-md)] font-medium mb-2">Strategy Canvas</h3>
        <p className="text-[length:var(--fs-md)] text-muted-foreground mb-4 max-w-md mx-auto">
          Configure your deck&apos;s strategic intent — win conditions, power level,
          budget preferences, and format constraints. This context drives personalised
          dead weight detection and upgrade recommendations.
        </p>
        <Button onClick={handleStartOnboarding} size="sm">
          Configure Strategy
        </Button>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Viewing state
  // -------------------------------------------------------------------------
  if (effectiveState === 'viewing' && data) {
    return (
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[length:var(--fs-md)] font-medium">Strategy Canvas</h3>
          <Button variant="ghost" size="sm" onClick={handleStartEditing}>
            <Edit2 className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
        </div>

        <div className="grid gap-2 text-[length:var(--fs-md)]">
          {data.win_condition && (
            <div>
              <span className="text-muted-foreground">Win Condition:</span>{' '}
              <span>{data.win_condition}</span>
            </div>
          )}
          {data.table_context && (
            <div>
              <span className="text-muted-foreground">Table Context:</span>{' '}
              <span>{data.table_context}</span>
            </div>
          )}
          {data.bracket && (
            <div>
              <span className="text-muted-foreground">Bracket:</span>{' '}
              <Badge variant="secondary">{BRACKET_LABELS[data.bracket] || data.bracket}</Badge>
            </div>
          )}
          {data.budget_mode && (
            <div>
              <span className="text-muted-foreground">Budget:</span>{' '}
              <span>
                {BUDGET_MODE_LABELS[data.budget_mode] || data.budget_mode}
                {data.budget_mode === 'budget' && data.budget_ceiling != null && (
                  <> (${data.budget_ceiling})</>
                )}
              </span>
            </div>
          )}
          {data.format_rules && (
            <div>
              <span className="text-muted-foreground">Format:</span>{' '}
              <Badge variant="outline">
                {data.format_rules.format_name === 'precon_mod' && 'Precon Mod'}
                {data.format_rules.format_name === 'baggy_league' && 'Baggy League'}
                {data.format_rules.format_name === 'custom' && 'Custom'}
              </Badge>
              {data.format_rules.format_name === 'baggy_league' && (
                <span className="ml-2 text-muted-foreground">
                  Level {(data.format_rules as FormatRulesBaggyLeague).progression_level} •{' '}
                  Max rarity: {(data.format_rules as FormatRulesBaggyLeague).rarity_restriction}
                </span>
              )}
              {data.format_rules.format_name === 'precon_mod' && (
                <span className="ml-2 text-muted-foreground">
                  {(data.format_rules as FormatRulesPreconMod).swap_limit} swaps •{' '}
                  ${(data.format_rules as FormatRulesPreconMod).value_cap} cap
                </span>
              )}
            </div>
          )}
          {data.frustration && (
            <div>
              <span className="text-muted-foreground">Frustrations:</span>{' '}
              <span>{data.frustration}</span>
            </div>
          )}
          {data.strategy_notes && (
            <div>
              <span className="text-muted-foreground">Notes:</span>{' '}
              <span>{data.strategy_notes}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Editing state
  // -------------------------------------------------------------------------
  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <h3 className="text-[length:var(--fs-md)] font-medium">Configure Strategy</h3>

      {/* Win Condition */}
      <fieldset className="space-y-1">
        <label htmlFor="win_condition" className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">
          Win Condition
        </label>
        <Textarea
          id="win_condition"
          placeholder="How does this deck win? (e.g., infinite combos, commander damage, token swarm)"
          value={winCondition}
          onChange={e => setWinCondition(e.target.value)}
          rows={2}
        />
      </fieldset>

      {/* Table Context */}
      <fieldset className="space-y-1">
        <label htmlFor="table_context" className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">
          Table Context
        </label>
        <Textarea
          id="table_context"
          placeholder="Describe your playgroup, meta, or typical opponents"
          value={tableContext}
          onChange={e => setTableContext(e.target.value)}
          rows={2}
        />
      </fieldset>

      {/* Bracket */}
      <fieldset className="space-y-1">
        <label htmlFor="bracket" className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">
          Bracket (Power Level)
        </label>
        <select
          id="bracket"
          value={bracket}
          onChange={e => setBracket(e.target.value ? Number(e.target.value) : '')}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-[length:var(--fs-md)]"
        >
          <option value="">Select bracket...</option>
          {Object.entries(BRACKET_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </fieldset>

      {/* Budget Mode */}
      <fieldset className="space-y-1">
        <label htmlFor="budget_mode" className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">
          Budget Mode
        </label>
        <select
          id="budget_mode"
          value={budgetMode}
          onChange={e => setBudgetMode(e.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-[length:var(--fs-md)]"
        >
          <option value="">Select budget mode...</option>
          <option value="collection">Collection Only — suggest owned cards</option>
          <option value="budget">Budget — suggest within price ceiling</option>
          <option value="unrestricted">Unrestricted — suggest any card</option>
        </select>
      </fieldset>

      {/* Budget Ceiling (conditional) */}
      {budgetMode === 'budget' && (
        <fieldset className="space-y-1">
          <label htmlFor="budget_ceiling" className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">
            Budget Ceiling ($)
          </label>
          <Input
            id="budget_ceiling"
            type="number"
            min={0}
            step={0.5}
            placeholder="Maximum price per card"
            value={budgetCeiling}
            onChange={e => setBudgetCeiling(e.target.value ? Number(e.target.value) : '')}
          />
        </fieldset>
      )}

      {/* Format Type */}
      <fieldset className="space-y-1">
        <label htmlFor="format_type" className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">
          Format Type
        </label>
        <select
          id="format_type"
          value={formatType}
          onChange={e => handleFormatTypeChange(e.target.value as FormatType)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-[length:var(--fs-md)]"
        >
          <option value="none">None</option>
          <option value="precon_mod">Precon Mod</option>
          <option value="baggy_league">Baggy League</option>
          <option value="custom">Custom</option>
        </select>
      </fieldset>

      {/* Format-specific fields: Precon Mod */}
      {formatType === 'precon_mod' && formatRules?.format_name === 'precon_mod' && (
        <div className="space-y-3 rounded-md border border-dashed border-muted-foreground/20 p-3">
          <p className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">Precon Mod Rules</p>

          <fieldset className="space-y-1">
            <label htmlFor="swap_limit" className="text-[length:var(--fs-sm)] text-muted-foreground">Swap Limit</label>
            <Input
              id="swap_limit"
              type="number"
              min={1}
              value={(formatRules as FormatRulesPreconMod).swap_limit}
              onChange={e => setFormatRules({
                ...(formatRules as FormatRulesPreconMod),
                swap_limit: Number(e.target.value) || 10,
              })}
            />
          </fieldset>

          <fieldset className="space-y-1">
            <label htmlFor="mandatory_cuts" className="text-[length:var(--fs-sm)] text-muted-foreground">
              Mandatory Cuts (comma-separated)
            </label>
            <Input
              id="mandatory_cuts"
              type="text"
              placeholder="Sol Ring, ..."
              value={(formatRules as FormatRulesPreconMod).mandatory_cuts.join(', ')}
              onChange={e => setFormatRules({
                ...(formatRules as FormatRulesPreconMod),
                mandatory_cuts: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
              })}
            />
          </fieldset>

          <div className="grid grid-cols-2 gap-2">
            <fieldset className="space-y-1">
              <label className="text-[length:var(--fs-sm)] text-muted-foreground">Mythic slots</label>
              <Input
                type="number"
                min={0}
                value={(formatRules as FormatRulesPreconMod).rarity_budget.mythic}
                onChange={e => setFormatRules({
                  ...(formatRules as FormatRulesPreconMod),
                  rarity_budget: {
                    ...(formatRules as FormatRulesPreconMod).rarity_budget,
                    mythic: Number(e.target.value) || 0,
                  },
                })}
              />
            </fieldset>
            <fieldset className="space-y-1">
              <label className="text-[length:var(--fs-sm)] text-muted-foreground">Rare slots</label>
              <Input
                type="number"
                min={0}
                value={(formatRules as FormatRulesPreconMod).rarity_budget.rare}
                onChange={e => setFormatRules({
                  ...(formatRules as FormatRulesPreconMod),
                  rarity_budget: {
                    ...(formatRules as FormatRulesPreconMod).rarity_budget,
                    rare: Number(e.target.value) || 0,
                  },
                })}
              />
            </fieldset>
            <fieldset className="space-y-1">
              <label className="text-[length:var(--fs-sm)] text-muted-foreground">Uncommon slots</label>
              <Input
                type="number"
                min={0}
                value={(formatRules as FormatRulesPreconMod).rarity_budget.uncommon}
                onChange={e => setFormatRules({
                  ...(formatRules as FormatRulesPreconMod),
                  rarity_budget: {
                    ...(formatRules as FormatRulesPreconMod).rarity_budget,
                    uncommon: Number(e.target.value) || 0,
                  },
                })}
              />
            </fieldset>
            <fieldset className="space-y-1">
              <label className="text-[length:var(--fs-sm)] text-muted-foreground">Common slots</label>
              <Input
                type="number"
                min={0}
                value={(formatRules as FormatRulesPreconMod).rarity_budget.common}
                onChange={e => setFormatRules({
                  ...(formatRules as FormatRulesPreconMod),
                  rarity_budget: {
                    ...(formatRules as FormatRulesPreconMod).rarity_budget,
                    common: Number(e.target.value) || 0,
                  },
                })}
              />
            </fieldset>
          </div>

          <fieldset className="space-y-1">
            <label htmlFor="value_cap" className="text-[length:var(--fs-sm)] text-muted-foreground">Value Cap ($)</label>
            <Input
              id="value_cap"
              type="number"
              min={0}
              step={1}
              value={(formatRules as FormatRulesPreconMod).value_cap}
              onChange={e => setFormatRules({
                ...(formatRules as FormatRulesPreconMod),
                value_cap: Number(e.target.value) || 50,
              })}
            />
          </fieldset>

          <fieldset className="space-y-1">
            <label htmlFor="precon_url" className="text-[length:var(--fs-sm)] text-muted-foreground">Precon URL</label>
            <Input
              id="precon_url"
              type="url"
              placeholder="https://archidekt.com/decks/..."
              value={(formatRules as FormatRulesPreconMod).precon_url}
              onChange={e => setFormatRules({
                ...(formatRules as FormatRulesPreconMod),
                precon_url: e.target.value,
              })}
            />
          </fieldset>
        </div>
      )}

      {/* Format-specific fields: Baggy League */}
      {formatType === 'baggy_league' && formatRules?.format_name === 'baggy_league' && (
        <div className="space-y-3 rounded-md border border-dashed border-muted-foreground/20 p-3">
          <p className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">Baggy League Rules</p>

          <fieldset className="space-y-1">
            <label htmlFor="rarity_restriction" className="text-[length:var(--fs-sm)] text-muted-foreground">
              Max Rarity Allowed
            </label>
            <select
              id="rarity_restriction"
              value={(formatRules as FormatRulesBaggyLeague).rarity_restriction}
              onChange={e => setFormatRules({
                ...(formatRules as FormatRulesBaggyLeague),
                rarity_restriction: e.target.value as typeof RARITY_OPTIONS[number],
              })}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-[length:var(--fs-md)]"
            >
              {RARITY_OPTIONS.map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </fieldset>

          <fieldset className="space-y-1">
            <label htmlFor="progression_level" className="text-[length:var(--fs-sm)] text-muted-foreground">
              Progression Level
            </label>
            <Input
              id="progression_level"
              type="number"
              min={1}
              value={(formatRules as FormatRulesBaggyLeague).progression_level}
              onChange={e => setFormatRules({
                ...(formatRules as FormatRulesBaggyLeague),
                progression_level: Number(e.target.value) || 1,
              })}
            />
          </fieldset>

          <fieldset className="space-y-1">
            <label htmlFor="progression_points" className="text-[length:var(--fs-sm)] text-muted-foreground">
              Progression Points
            </label>
            <Input
              id="progression_points"
              type="number"
              min={0}
              value={(formatRules as FormatRulesBaggyLeague).progression_points}
              onChange={e => setFormatRules({
                ...(formatRules as FormatRulesBaggyLeague),
                progression_points: Number(e.target.value) || 0,
              })}
            />
          </fieldset>
        </div>
      )}

      {/* Format-specific fields: Custom */}
      {formatType === 'custom' && formatRules?.format_name === 'custom' && (
        <div className="space-y-3 rounded-md border border-dashed border-muted-foreground/20 p-3">
          <p className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">Custom Format Rules</p>

          <fieldset className="space-y-1">
            <label htmlFor="custom_description" className="text-[length:var(--fs-sm)] text-muted-foreground">
              Description
            </label>
            <Textarea
              id="custom_description"
              placeholder="Describe the format rules..."
              value={(formatRules as FormatRulesCustom).description}
              onChange={e => setFormatRules({
                ...(formatRules as FormatRulesCustom),
                description: e.target.value,
              })}
              rows={2}
            />
          </fieldset>

          <fieldset className="space-y-1">
            <label htmlFor="custom_constraints" className="text-[length:var(--fs-sm)] text-muted-foreground">
              Constraints (one per line)
            </label>
            <Textarea
              id="custom_constraints"
              placeholder="No infinite combos&#10;Max $5 per card&#10;..."
              value={(formatRules as FormatRulesCustom).constraints.join('\n')}
              onChange={e => setFormatRules({
                ...(formatRules as FormatRulesCustom),
                constraints: e.target.value.split('\n').filter(Boolean),
              })}
              rows={3}
            />
          </fieldset>
        </div>
      )}

      {/* Frustration */}
      <fieldset className="space-y-1">
        <label htmlFor="frustration" className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">
          Frustrations
        </label>
        <Textarea
          id="frustration"
          placeholder="What annoys you about this deck? What problems need solving?"
          value={frustration}
          onChange={e => setFrustration(e.target.value)}
          rows={2}
        />
      </fieldset>

      {/* Strategy Notes */}
      <fieldset className="space-y-1">
        <label htmlFor="strategy_notes" className="text-[length:var(--fs-sm)] font-medium text-muted-foreground">
          Strategy Notes
        </label>
        <Textarea
          id="strategy_notes"
          placeholder="Any other context about how you want to play this deck"
          value={strategyNotes}
          onChange={e => setStrategyNotes(e.target.value)}
          rows={2}
        />
      </fieldset>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSubmit} size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1" />
          )}
          Save Strategy
        </Button>
        {data?.configured && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCanvasState('viewing')}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
