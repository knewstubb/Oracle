/**
 * Backfill commander_id on decks from their build_id
 * 
 * Some decks have build_id set but commander_id is null,
 * causing the Strategy tab to not load insights.
 * 
 * This script derives commander_id from ref_commander_builds.
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function backfill() {
  // Find all decks with build_id but null commander_id
  const { data: decks, error: fetchError } = await supabase
    .from('decks')
    .select('id, name, build_id')
    .not('build_id', 'is', null)
    .is('commander_id', null)

  if (fetchError) {
    console.error('Failed to fetch decks:', fetchError)
    return
  }

  console.log(`Found ${decks.length} decks to backfill`)

  for (const deck of decks) {
    // Get commander_id from the build
    const { data: build, error: buildError } = await supabase
      .from('ref_commander_builds')
      .select('commander_id')
      .eq('id', deck.build_id)
      .single()

    if (buildError || !build) {
      console.error(`Failed to find build for deck: ${deck.name}`, buildError)
      continue
    }

    // Update the deck
    const { error: updateError } = await supabase
      .from('decks')
      .update({ commander_id: build.commander_id })
      .eq('id', deck.id)

    if (updateError) {
      console.error(`Failed to update deck: ${deck.name}`, updateError)
    } else {
      console.log(`Updated ${deck.name} -> commander_id: ${build.commander_id}`)
    }
  }

  console.log('Done!')
}

backfill().catch(console.error)
