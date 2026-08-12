/**
 * User Preferences
 * 
 * Stores and retrieves user-specific playgroup context, playstyle preferences,
 * and house rules for use in brewing prompts.
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserPreferences {
  user_id: string
  
  // Playgroup context
  bracket_min: number
  bracket_max: number
  playgroup_description: string | null
  
  // House rules
  no_infinite_combos: boolean
  no_stax: boolean
  no_mld: boolean
  no_extra_turns: boolean
  custom_house_rules: string[] | null
  
  // Playstyle preferences
  preferred_archetypes: string[] | null
  disliked_archetypes: string[] | null
  playstyle_notes: string | null
  
  // Budget preferences
  budget_mode: 'budget' | 'flexible' | 'no_limit'
  max_card_price: number | null
  prefer_owned_cards: boolean
  
  // Collection context
  collection_size: number | null
  favourite_decks: string[] | null
}

// ---------------------------------------------------------------------------
// Fetch preferences
// ---------------------------------------------------------------------------

/**
 * Get user preferences, creating defaults if none exist.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const supabase = createAdminClient()
  
  // Table not in generated types (migration not pushed yet) — cast to any
  // Try to fetch existing preferences
  const { data, error } = await (supabase as any)
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  
  if (error) {
    console.error('[user-preferences] Error fetching preferences:', error)
    return getDefaultPreferences(userId)
  }
  
  if (data) {
    return data as UserPreferences
  }
  
  // Create default preferences if none exist
  const defaults = getDefaultPreferences(userId)
  const { data: inserted, error: insertErr } = await (supabase as any)
    .from('user_preferences')
    .insert(defaults)
    .select()
    .single()
  
  if (insertErr) {
    console.error('[user-preferences] Error creating default preferences:', insertErr)
    return defaults
  }
  
  return inserted as UserPreferences
}

/**
 * Default preferences used when DB fetch fails.
 */
function getDefaultPreferences(userId: string): UserPreferences {
  return {
    user_id: userId,
    bracket_min: 3,
    bracket_max: 4,
    playgroup_description: null,
    no_infinite_combos: false,
    no_stax: false,
    no_mld: false,
    no_extra_turns: false,
    custom_house_rules: null,
    preferred_archetypes: null,
    disliked_archetypes: null,
    playstyle_notes: null,
    budget_mode: 'flexible',
    max_card_price: null,
    prefer_owned_cards: true,
    collection_size: null,
    favourite_decks: null,
  }
}

// ---------------------------------------------------------------------------
// Format for prompts
// ---------------------------------------------------------------------------

/**
 * Format user preferences as a prompt block for the AI.
 */
export function formatPlayerContextPrompt(prefs: UserPreferences): string {
  const lines: string[] = []
  
  lines.push('=== PLAYER CONTEXT ===')
  lines.push('')
  
  // Bracket / power level
  const bracketStr = prefs.bracket_min === prefs.bracket_max
    ? `${prefs.bracket_min}`
    : `${prefs.bracket_min}-${prefs.bracket_max}`
  lines.push(`- Playgroup bracket: ${bracketStr}. ${getBracketDescription(prefs.bracket_min, prefs.bracket_max)}`)
  
  // Playgroup description
  if (prefs.playgroup_description) {
    lines.push(`- Playgroup: ${prefs.playgroup_description}`)
  }
  
  // House rules
  const houseRules: string[] = []
  if (prefs.no_infinite_combos) houseRules.push('No infinite combos')
  if (prefs.no_stax) houseRules.push('No stax')
  if (prefs.no_mld) houseRules.push('No MLD (mass land destruction)')
  if (prefs.no_extra_turns) houseRules.push('No extra turn spells')
  if (prefs.custom_house_rules?.length) {
    houseRules.push(...prefs.custom_house_rules)
  }
  
  if (houseRules.length > 0) {
    lines.push(`- House rules: ${houseRules.join('. ')}.`)
  }
  
  // Playstyle preferences
  if (prefs.preferred_archetypes?.length) {
    lines.push(`- Player enjoys: ${prefs.preferred_archetypes.join(', ')} strategies.`)
  }
  if (prefs.disliked_archetypes?.length) {
    lines.push(`- Player dislikes: ${prefs.disliked_archetypes.join(', ')} strategies.`)
  }
  if (prefs.playstyle_notes) {
    lines.push(`- Playstyle: ${prefs.playstyle_notes}`)
  }
  
  // Budget
  const budgetLines: string[] = []
  if (prefs.budget_mode === 'budget') {
    budgetLines.push('Budget-conscious')
    if (prefs.max_card_price) {
      budgetLines.push(`max $${prefs.max_card_price} per card`)
    }
  } else if (prefs.budget_mode === 'no_limit') {
    budgetLines.push('No budget restrictions')
  } else {
    budgetLines.push('Flexible budget')
  }
  if (prefs.prefer_owned_cards) {
    budgetLines.push('prefers building from owned cards')
  }
  lines.push(`- Budget: ${budgetLines.join(', ')}. Show both premium and budget options — never filter silently.`)
  
  // Collection context
  if (prefs.collection_size) {
    lines.push(`- Collection: ~${prefs.collection_size.toLocaleString()} cards.`)
  }
  if (prefs.favourite_decks?.length) {
    lines.push(`- Favourite decks: ${prefs.favourite_decks.join(', ')}.`)
  }
  
  lines.push('')
  lines.push('=== END PLAYER CONTEXT ===')
  
  return lines.join('\n')
}

/**
 * Get a human-readable description of the bracket range.
 */
function getBracketDescription(min: number, max: number): string {
  if (min <= 2 && max <= 2) return 'Casual/precon level.'
  if (min <= 2 && max <= 3) return 'Casual to focused.'
  if (min === 3 && max === 3) return 'Focused, optimized but not cutthroat.'
  if (min === 3 && max === 4) return 'Casual-competitive. Focused decks, no pubstomping.'
  if (min === 4 && max === 4) return 'High power. Optimized, fast wins expected.'
  return 'Mixed power levels.'
}

// ---------------------------------------------------------------------------
// Update preferences
// ---------------------------------------------------------------------------

/**
 * Update user preferences.
 */
export async function updateUserPreferences(
  userId: string,
  updates: Partial<Omit<UserPreferences, 'user_id'>>
): Promise<UserPreferences | null> {
  const supabase = createAdminClient()
  
  // Table not in generated types (migration not pushed yet) — cast to any
  const { data, error } = await (supabase as any)
    .from('user_preferences')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) {
    console.error('[user-preferences] Error updating preferences:', error)
    return null
  }
  
  return data as UserPreferences
}
