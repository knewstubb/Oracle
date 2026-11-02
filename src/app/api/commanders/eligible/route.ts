/**
 * POST /api/commanders/eligible  { names: string[] }
 * Returns which of the given card names can be chosen as a commander.
 *
 * POST /api/commanders/eligible?role=companion  { names: string[] }
 * Returns which of the given card names have the Companion keyword (can be chosen as a companion).
 *
 * POST /api/commanders/eligible?role=second  { names: string[], with: string }
 * Returns which of the given names can be the second commander (Partner / Background) next to the
 * commander `with`: they can lead a deck and the pair is legal.
 * POST /api/commanders/eligible?role=second-kind  { with: string }
 * Returns { kind } : which second-commander slot the commander `with` allows (partner, partner_with, background,
 * friends_forever, doctors_companion) or null when it allows none.
 * Without `role` the response is unchanged.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'
import {
  eligibleCompanionNames,
  eligibleNames,
  eligibleSecondNames,
  type CommanderCardFacts,
} from '@/lib/commander-eligibility'
import { secondSlotKindFor } from '@/lib/commander-pairing'

const MAX_NAMES = 500

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = request.nextUrl.searchParams.get('role')
  if (role !== null && role !== 'companion' && role !== 'second' && role !== 'second-kind') {
    return NextResponse.json({ error: 'Unknown role' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  if (role === 'second-kind') {
    const withName = typeof body?.with === 'string' ? body.with : null
    if (!withName) return NextResponse.json({ error: 'Needs the commander name' }, { status: 400 })
    const { data: row, error: err } = await createAdminClient()
      .from('ref_cards')
      .select('name, type_line, oracle_text')
      .eq('name', withName)
      .limit(1)
      .maybeSingle()
    if (err) return NextResponse.json({ error: 'Could not check the commander' }, { status: 500 })
    return NextResponse.json({ kind: row ? secondSlotKindFor(row) : null })
  }

  const names: string[] = Array.isArray(body?.names)
    ? [...new Set<string>(body.names.filter((n: unknown): n is string => typeof n === 'string'))].slice(0, MAX_NAMES)
    : []
  if (names.length === 0) return NextResponse.json({ eligible: [] })

  const supabase = createAdminClient()

  if (role === 'second') {
    // Body: { names, with } — `with` is the commander the second one must pair with.
    const withName = typeof body?.with === 'string' ? body.with : null
    if (!withName) return NextResponse.json({ error: 'A partner or background needs the commander to pair with' }, { status: 400 })
    const { data: rows, error: err } = await supabase
      .from('ref_cards')
      .select('name, type_line, oracle_text, power, toughness, commander_legal, can_be_commander')
      .in('name', [...new Set([...names, withName])])
    if (err) return NextResponse.json({ error: 'Could not check commanders' }, { status: 500 })
    const byName = new Map<string, CommanderCardFacts & { name: string }>()
    for (const row of rows ?? []) byName.set(row.name.toLowerCase(), row)
    const primary = byName.get(withName.toLowerCase())
    if (!primary) return NextResponse.json({ eligible: [] })
    return NextResponse.json({
      eligible: eligibleSecondNames(
        { name: primary.name, type_line: primary.type_line, oracle_text: primary.oracle_text },
        names.filter((n) => n.toLowerCase() !== withName.toLowerCase()),
        byName
      ),
    })
  }
  const { data, error } = await supabase
    .from('ref_cards')
    .select('name, type_line, oracle_text, power, toughness, commander_legal, can_be_commander')
    .in('name', names)
  if (error) return NextResponse.json({ error: 'Could not check commanders' }, { status: 500 })

  const facts = new Map<string, CommanderCardFacts>()
  for (const row of data ?? []) facts.set(row.name.toLowerCase(), row)
  return NextResponse.json({
    eligible: role === 'companion' ? eligibleCompanionNames(names, facts) : eligibleNames(names, facts),
  })
}
