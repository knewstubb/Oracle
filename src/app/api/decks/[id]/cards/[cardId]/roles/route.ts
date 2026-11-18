import { NextRequest } from 'next/server'
import { ROLE_SLUGS, type OwnerRoleAction, type RoleSlug } from '@/lib/card-window-stored-roles'
import { loadStoredRoles, slotOracleId, writeOwnerRole, type RolesRpcClient } from '@/lib/card-window-stored-roles-server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { fetchRefTextByName } from '@/lib/ref-card-text'
import { cardWindowRoles, cardWindowTypes } from '@/lib/card-window-roles'

/**
 * GET /api/decks/[id]/cards/[cardId]/roles
 * Read-only. For one card of the signed-in user's deck: the stored roles (shared baseline plus the user's own
 * changes, from get_effective_card_roles) and the roles the app works out from the card text (the stand-in the
 * window folds in for roles nothing stored speaks about). Nothing is written. Another user's deck or card is a 404; a failed
 * lookup is a real error (500), never an empty answer (D-030).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id, cardId } = await params
  const deckId = parseInt(id, 10)
  const deckCardId = parseInt(cardId, 10)
  if (isNaN(deckId) || isNaN(deckCardId)) {
    return Response.json({ error: 'Invalid deck ID or card ID' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', authResult.id)
    .maybeSingle()
  if (deckErr) return Response.json({ error: deckErr.message }, { status: 500 })
  if (!deck) return Response.json({ error: 'Deck not found' }, { status: 404 })
  const { data: row, error: rowErr } = await supabase
    .from('deck_cards')
    .select('card_name')
    .eq('id', deckCardId)
    .eq('deck_id', deckId)
    .maybeSingle()
  if (rowErr) return Response.json({ error: rowErr.message }, { status: 500 })
  if (!row) return Response.json({ error: 'Card not found in this deck' }, { status: 404 })
  const cardName = (row as { card_name: string }).card_name
  const { map, error: refErr } = await fetchRefTextByName(supabase, [cardName])
  if (refErr) return Response.json({ error: refErr }, { status: 500 })
  const ref = map.get(cardName)
  // One lookup answers both the roles and the type groups the card window shows.
  const stored = await loadStoredRoles(supabase as unknown as RolesRpcClient, authResult.id, deckId, deckCardId)
  return Response.json({
    stored,
    ...cardWindowRoles({ name: cardName, typeLine: ref?.type_line ?? null, oracleText: ref?.oracle_text ?? null }),
    types: cardWindowTypes(ref?.type_line ?? null),
  })
}

const ACTIONS: readonly OwnerRoleAction[] = ['add', 'remove', 'clear']

/**
 * PUT /api/decks/[id]/cards/[cardId]/roles   body { role, action: 'add' | 'remove' | 'clear' }
 * The signed-in user adds a universal role to the card, removes one (hides a shared one for them only), or clears
 * their own change. Returns the value it replaced, so the window can offer a 10-second Undo. Owner edits are not
 * written to the Claude change log (contract S15).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id, cardId } = await params
  const deckId = parseInt(id, 10)
  const deckCardId = parseInt(cardId, 10)
  if (isNaN(deckId) || isNaN(deckCardId)) {
    return Response.json({ error: 'Invalid deck ID or card ID' }, { status: 400 })
  }
  let body: { role?: unknown; action?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const role = ROLE_SLUGS.find((r) => r === body.role) as RoleSlug | undefined
  const action = ACTIONS.find((a) => a === body.action)
  if (!role || !action) return Response.json({ error: 'role and action are required and must be known values' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', authResult.id)
    .maybeSingle()
  if (deckErr) return Response.json({ error: deckErr.message }, { status: 500 })
  if (!deck) return Response.json({ error: 'Deck not found' }, { status: 404 })
  const { data: row, error: rowErr } = await supabase
    .from('deck_cards')
    .select('id')
    .eq('id', deckCardId)
    .eq('deck_id', deckId)
    .maybeSingle()
  if (rowErr) return Response.json({ error: rowErr.message }, { status: 500 })
  if (!row) return Response.json({ error: 'Card not found in this deck' }, { status: 404 })

  const client = supabase as unknown as RolesRpcClient
  const identity = await slotOracleId(client, authResult.id, deckId, deckCardId)
  if (identity.error) return Response.json({ error: identity.error }, { status: 500 })
  if (!identity.oracleId) {
    return Response.json({ error: 'This card could not be matched to a card identity, so its roles can\'t be saved.', code: 'card_not_identified' }, { status: 422 })
  }
  const result = await writeOwnerRole(client, authResult.id, identity.oracleId, role, action)
  if (!result.ok) {
    const status = result.code === 'failed' ? 500 : result.code === 'unknown_card' ? 422 : 400
    return Response.json({ error: 'Could not save the role.', code: result.code }, { status })
  }
  return Response.json({ previous: result.previous, current: result.current })
}
