// Live check (skipped unless RUN_LIVE_RPC_TESTS=1 and the anon key is set): an anonymous caller must be denied
// EXECUTE on the command-zone RPCs. It uses a deck id that cannot exist, so even if the grant were wrong the call
// would raise deck_not_found and write nothing.
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const live = process.env.RUN_LIVE_RPC_TESTS === '1' && !!url && !!anon

describe.skipIf(!live)('command-zone RPCs deny anon', () => {
  const client = () => createClient(url!, anon!)
  const nobody = '00000000-0000-0000-0000-000000000000'

  it('set_deck_command_zone', async () => {
    const { error } = await client().rpc('set_deck_command_zone', {
      p_deck_id: -1, p_user_id: nobody, p_primary_card_id: null, p_second_card_id: null, p_second_role: null, p_companion_card_id: null,
    })
    expect(error?.message ?? '').toMatch(/permission denied|not found|PGRST202/i)
    expect(error?.message ?? '').not.toMatch(/deck_not_found/)
  })

  it('import_deck_with_intent_roles', async () => {
    const { error } = await client().rpc('import_deck_with_intent_roles', { p_deck_id: -1, p_user_id: nobody, p_rows: [] })
    expect(error?.message ?? '').toMatch(/permission denied|not found|PGRST202/i)
  })
})
