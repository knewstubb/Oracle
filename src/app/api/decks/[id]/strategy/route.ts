import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const VALID_BUDGET_MODES = ['collection', 'budget', 'unrestricted']

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  const { data: row, error: stratErr } = await supabase
    .from('deck_strategy')
    .select('*')
    .eq('deck_id', deckId)
    .maybeSingle()

  if (stratErr) {
    return Response.json({ error: stratErr.message }, { status: 500 })
  }

  if (!row) {
    return Response.json({
      deck_id: deckId,
      win_condition: null,
      table_context: null,
      bracket: null,
      budget_mode: null,
      budget_ceiling: null,
      frustration: null,
      strategy_notes: null,
      format_rules: null,
      updated_at: null,
      configured: false,
    })
  }

  // Parse format_rules JSON if present
  let formatRules = null
  if (row.format_rules) {
    try {
      formatRules = JSON.parse(row.format_rules)
    } catch {
      formatRules = row.format_rules
    }
  }

  return Response.json({
    ...row,
    format_rules: formatRules,
    configured: true,
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  const body = await request.json()

  // Validate bracket if provided
  if (body.bracket !== undefined && body.bracket !== null) {
    const bracket = Number(body.bracket)
    if (!Number.isInteger(bracket) || bracket < 1 || bracket > 4) {
      return Response.json(
        { error: 'Bracket must be an integer between 1 and 4' },
        { status: 400 }
      )
    }
  }

  // Validate budget_mode if provided
  if (body.budget_mode !== undefined && body.budget_mode !== null) {
    if (!VALID_BUDGET_MODES.includes(body.budget_mode)) {
      return Response.json(
        { error: `budget_mode must be one of: ${VALID_BUDGET_MODES.join(', ')}` },
        { status: 400 }
      )
    }
  }

  // Validate budget_ceiling is required when budget_mode is 'budget'
  if (body.budget_mode === 'budget' && (body.budget_ceiling === undefined || body.budget_ceiling === null)) {
    return Response.json(
      { error: 'budget_ceiling is required when budget_mode is "budget"' },
      { status: 400 }
    )
  }

  // Stringify format_rules if it's an object
  const formatRules = body.format_rules !== undefined && body.format_rules !== null
    ? (typeof body.format_rules === 'string' ? body.format_rules : JSON.stringify(body.format_rules))
    : null

  const updatedAt = new Date().toISOString()
  const DEFAULT_USER_ID = process.env.SUPABASE_DEFAULT_USER_ID ?? '00000000-0000-0000-0000-000000000000'

  const { error: upsertErr } = await supabase
    .from('deck_strategy')
    .upsert(
      {
        deck_id: deckId,
        win_condition: body.win_condition ?? null,
        table_context: body.table_context ?? null,
        bracket: body.bracket ?? null,
        budget_mode: body.budget_mode ?? null,
        budget_ceiling: body.budget_ceiling ?? null,
        frustration: body.frustration ?? null,
        strategy_notes: body.strategy_notes ?? null,
        format_rules: formatRules,
        updated_at: updatedAt,
        user_id: DEFAULT_USER_ID,
      },
      { onConflict: 'deck_id' }
    )

  if (upsertErr) {
    return Response.json({ error: upsertErr.message }, { status: 500 })
  }

  // Read back the upserted record
  const { data: row, error: readErr } = await supabase
    .from('deck_strategy')
    .select('*')
    .eq('deck_id', deckId)
    .single()

  if (readErr) {
    return Response.json({ error: readErr.message }, { status: 500 })
  }

  // Parse format_rules JSON for the response
  let parsedFormatRules = null
  if (row.format_rules) {
    try {
      parsedFormatRules = JSON.parse(row.format_rules)
    } catch {
      parsedFormatRules = row.format_rules
    }
  }

  return Response.json({
    ...row,
    format_rules: parsedFormatRules,
    configured: true,
  })
}
