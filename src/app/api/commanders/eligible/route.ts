/**
 * POST /api/commanders/eligible  { names: string[] }
 * Returns which of the given card names can be chosen as a commander.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'
import { eligibleNames, type CommanderCardFacts } from '@/lib/commander-eligibility'

const MAX_NAMES = 500

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const names: string[] = Array.isArray(body?.names)
    ? [...new Set<string>(body.names.filter((n: unknown): n is string => typeof n === 'string'))].slice(0, MAX_NAMES)
    : []
  if (names.length === 0) return NextResponse.json({ eligible: [] })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('ref_cards')
    .select('name, type_line, oracle_text, power, toughness, commander_legal, can_be_commander')
    .in('name', names)
  if (error) return NextResponse.json({ error: 'Could not check commanders' }, { status: 500 })

  const facts = new Map<string, CommanderCardFacts>()
  for (const row of data ?? []) facts.set(row.name.toLowerCase(), row)
  return NextResponse.json({ eligible: eligibleNames(names, facts) })
}
