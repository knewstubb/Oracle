/**
 * Request parsing and error wording for PUT /api/decks/[id]/command-zone (T-62 slice 3).
 * Pure so it can be unit-tested without a database.
 */

export interface CommandZoneRequest {
  primaryCardId: number | null
  secondCardId: number | null
  secondRole: 'partner' | 'background' | null
  companionCardId: number | null
}

export type ParsedCommandZoneRequest =
  | { ok: true; value: CommandZoneRequest }
  | { ok: false; error: string }

function idOrNull(v: unknown, field: string): number | null | { error: string } {
  if (v === undefined || v === null) return null
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    return { error: `${field} must be a card id from this deck.` }
  }
  return v
}

/** Body: { primaryCardId, secondCardId?, secondRole?, companionCardId? } — all are deck_cards.id values. */
export function parseCommandZoneRequest(body: unknown): ParsedCommandZoneRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body' }
  }
  const b = body as Record<string, unknown>
  const primary = idOrNull(b.primaryCardId, 'primaryCardId')
  const second = idOrNull(b.secondCardId, 'secondCardId')
  const companion = idOrNull(b.companionCardId, 'companionCardId')
  for (const x of [primary, second, companion]) {
    if (x !== null && typeof x === 'object') return { ok: false, error: x.error }
  }
  const role = b.secondRole ?? null
  if (second === null && role !== null) {
    return { ok: false, error: 'A second commander role needs a second commander.' }
  }
  if (second !== null && role !== 'partner' && role !== 'background') {
    return { ok: false, error: 'The second commander must be a Partner or a Background.' }
  }
  if (second !== null && primary === null) {
    return { ok: false, error: 'Pick a commander before a second commander.' }
  }
  const ids = [primary, second, companion].filter((x): x is number => typeof x === 'number')
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: 'The same card cannot fill two slots.' }
  }
  return {
    ok: true,
    value: {
      primaryCardId: primary as number | null,
      secondCardId: second as number | null,
      secondRole: (second === null ? null : role) as 'partner' | 'background' | null,
      companionCardId: companion as number | null,
    },
  }
}

export interface CommandZoneErrorReply {
  status: number
  code: string
  error: string
}

/** Turns a database error message from set_deck_command_zone into a plain reply. */
export function mapCommandZoneError(message: string | null | undefined): CommandZoneErrorReply {
  const m = message ?? ''
  const table: Array<[string, number, string]> = [
    ['deck_not_found', 404, 'Deck not found.'],
    ['card_not_in_deck', 404, 'One of those cards is not in this deck.'],
    ['duplicate_card', 400, 'The same card cannot fill two slots.'],
    ['invalid_second_role', 400, 'The second commander must be a Partner or a Background.'],
    ['second_without_primary', 400, 'Pick a commander before a second commander.'],
    [
      'companion_must_be_removed_first',
      409,
      'This deck already has a companion. Remove it first (you will be asked to confirm).',
    ],
  ]
  for (const [code, status, error] of table) {
    if (m.includes(code)) return { status, code, error }
  }
  if (/uq_deck_cards_one_companion|uq_deck_cards_one_partner_or_background|deck_cards_.*(check|not_commander|are_commanders)/.test(m)) {
    return { status: 409, code: 'role_conflict', error: 'A deck can have only one companion and one second commander.' }
  }
  return { status: 500, code: 'unknown', error: 'Could not save the command zone. Nothing was changed.' }
}
