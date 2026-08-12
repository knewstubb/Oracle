/**
 * Commander Resolver
 * 
 * Parses raw commander names (from content sources) into structured commander configurations.
 * Handles: single commanders, partner pairs, backgrounds, friends forever, oathbreaker.
 * 
 * Canonical key format:
 * - Single: "prosper-tome-bound"
 * - Partner: "thrasios-triton-hero//tymna-the-weaver" (alphabetically sorted)
 * - Background: "wilson-refined-grizzly+raised-by-giants"
 * - Background flex: "wilson-refined-grizzly+background" (any background)
 * - Oathbreaker: "saheeli-sublime-artificer+thoughtcast"
 */

import { createAdminClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// Allow injecting a client for scripts, or create one for API routes
let injectedClient: SupabaseClient | null = null;

export function setSupabaseClient(client: SupabaseClient) {
  injectedClient = client;
}

function getSupabaseClient(): SupabaseClient {
  if (injectedClient) {
    return injectedClient;
  }
  
  return createAdminClient();
}

// Commander types as defined in schema
export type CommanderType = 
  | 'single' 
  | 'partner' 
  | 'partner_with' 
  | 'friends_forever' 
  | 'background' 
  | 'background_flex' 
  | 'oathbreaker';

export type CardRole = 
  | 'commander' 
  | 'partner' 
  | 'background' 
  | 'background_any' 
  | 'signature_spell' 
  | 'oathbreaker';

export interface CommanderCard {
  cardName: string;
  role: CardRole;
  position: number;
  isFlexible: boolean;
}

export interface ResolvedCommander {
  canonicalKey: string;
  displayName: string;
  colorIdentity: string;
  commanderType: CommanderType;
  cards: CommanderCard[];
  legalCommander: boolean;
  legalOathbreaker: boolean;
  legalBrawl: boolean;
}

interface CardInfo {
  name: string;
  colorIdentity: string;
  oracleText: string | null;
  typeLine: string;
  canBeCommander: boolean;
}

// Cache for card lookups
const cardCache = new Map<string, CardInfo | null>();

/**
 * Normalize card name to slug format for canonical key
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[',]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parse a raw commander string into component card names
 * Handles: "A // B", "A and B", "A + B", "A / B"
 */
export function parseCommanderString(raw: string): string[] {
  // Normalize separators
  let normalized = raw.trim();
  
  // Handle "//" separator (most reliable for partners)
  if (normalized.includes('//')) {
    return normalized.split('//').map(s => s.trim()).filter(Boolean);
  }
  
  // Handle " / " separator (single slash with spaces)
  if (normalized.includes(' / ')) {
    return normalized.split(' / ').map(s => s.trim()).filter(Boolean);
  }
  
  // Handle " + " separator (backgrounds, oathbreaker)
  if (normalized.includes(' + ')) {
    return normalized.split(' + ').map(s => s.trim()).filter(Boolean);
  }
  
  // Handle " and " separator - but be careful, this can be in card names
  // Only split if it looks like two card names (both parts have capital letters at start)
  // AND neither part is a known single card name containing "and"
  const knownAndCards = [
    'adrix and nev',
    'djeru and hazoret', 
    'drana and linvala',
    'elenda and azor',
    'errant and giada',
    'surrak and goreclaw',
    'anax and cymede',
    'mina and denn',
    'tibor and lumia',
    'gisa and geralf',
    'kynaios and tiro',
  ];
  
  const lowerNormalized = normalized.toLowerCase();
  const isKnownAndCard = knownAndCards.some(card => lowerNormalized.includes(card));
  
  if (!isKnownAndCard) {
    const andParts = normalized.split(/ and /i);
    if (andParts.length === 2) {
      const [first, second] = andParts.map(s => s.trim());
      // Check if both look like card names (start with capital, reasonable length)
      if (
        first.length > 3 && 
        second.length > 3 && 
        /^[A-Z]/.test(first) && 
        /^[A-Z]/.test(second) &&
        !second.includes(' is ') && // Filter out sentences
        !second.includes(' are ') &&
        !second.includes(' can ') &&
        !second.includes(' the ') && // "X and the Y" is usually a sentence
        second.split(' ').length <= 5 // Card names are rarely more than 5 words
      ) {
        return [first, second];
      }
    }
  }
  
  // Single card
  return [normalized];
}

/**
 * Look up card info from ref_cards
 */
async function lookupCard(cardName: string): Promise<CardInfo | null> {
  // Check cache first
  const cached = cardCache.get(cardName.toLowerCase());
  if (cached !== undefined) {
    return cached;
  }
  
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ref_cards')
    .select('name, color_identity, oracle_text, type_line, can_be_commander')
    .ilike('name', cardName)
    .limit(1)
    .single();
  
  if (error || !data) {
    // Try fuzzy match
    const { data: fuzzyData } = await supabase
      .from('ref_cards')
      .select('name, color_identity, oracle_text, type_line, can_be_commander')
      .ilike('name', `%${cardName}%`)
      .limit(1)
      .single();
    
    const result = fuzzyData ? {
      name: fuzzyData.name,
      colorIdentity: fuzzyData.color_identity,
      oracleText: fuzzyData.oracle_text,
      typeLine: fuzzyData.type_line,
      canBeCommander: fuzzyData.can_be_commander ?? false
    } : null;
    
    cardCache.set(cardName.toLowerCase(), result);
    return result;
  }
  
  const result: CardInfo = {
    name: data.name,
    colorIdentity: data.color_identity,
    oracleText: data.oracle_text,
    typeLine: data.type_line,
    canBeCommander: data.can_be_commander ?? false
  };
  
  cardCache.set(cardName.toLowerCase(), result);
  return result;
}

/**
 * Detect commander keyword from oracle text
 */
function detectKeyword(oracleText: string | null, typeLine: string): {
  keyword: 'partner' | 'partner_with' | 'friends_forever' | 'background_chooser' | 'background' | 'doctors_companion' | 'doctor' | 'none';
  partnerWith?: string;
} {
  if (!oracleText) return { keyword: 'none' };
  
  const text = oracleText.toLowerCase();
  
  // Partner with X (must check before generic Partner)
  const partnerWithMatch = text.match(/partner with ([^(]+)/i);
  if (partnerWithMatch) {
    return { keyword: 'partner_with', partnerWith: partnerWithMatch[1].trim() };
  }
  
  // Friends forever
  if (text.includes('friends forever')) {
    return { keyword: 'friends_forever' };
  }
  
  // Doctor's Companion
  if (text.includes("doctor's companion")) {
    return { keyword: 'doctors_companion' };
  }
  
  // Check if card is a Doctor (Time Lord Doctor)
  if (typeLine.toLowerCase().includes('time lord') && text.includes('doctor')) {
    return { keyword: 'doctor' };
  }
  
  // Choose a Background
  if (text.includes('choose a background')) {
    return { keyword: 'background_chooser' };
  }
  
  // Generic Partner
  if (text.includes('partner')) {
    return { keyword: 'partner' };
  }
  
  // Background type
  if (typeLine.toLowerCase().includes('background')) {
    return { keyword: 'background' };
  }
  
  return { keyword: 'none' };
}

/**
 * Combine color identities from multiple cards
 */
function combineColorIdentity(identities: string[]): string {
  const colors = new Set<string>();
  const order = 'WUBRG';
  
  for (const identity of identities) {
    for (const char of identity.toUpperCase()) {
      if (order.includes(char)) {
        colors.add(char);
      }
    }
  }
  
  return order.split('').filter(c => colors.has(c)).join('');
}

/**
 * Resolve a raw commander string into a structured commander
 */
export async function resolveCommander(raw: string): Promise<ResolvedCommander | null> {
  const cardNames = parseCommanderString(raw);
  
  if (cardNames.length === 0) {
    return null;
  }
  
  // Look up all cards
  const cards: (CardInfo & { originalName: string })[] = [];
  for (const name of cardNames) {
    const info = await lookupCard(name);
    if (info) {
      cards.push({ ...info, originalName: name });
    }
  }
  
  if (cards.length === 0) {
    return null;
  }
  
  // Determine commander type based on card keywords
  let commanderType: CommanderType = 'single';
  const commanderCards: CommanderCard[] = [];
  
  if (cards.length === 1) {
    // Single commander
    const card = cards[0];
    const keyword = detectKeyword(card.oracleText, card.typeLine);
    
    // Could be a background chooser without a background specified
    if (keyword.keyword === 'background_chooser') {
      commanderType = 'background_flex';
      commanderCards.push({
        cardName: card.name,
        role: 'commander',
        position: 1,
        isFlexible: false
      });
      commanderCards.push({
        cardName: 'Any Background',
        role: 'background_any',
        position: 2,
        isFlexible: true
      });
    } else {
      commanderType = 'single';
      commanderCards.push({
        cardName: card.name,
        role: 'commander',
        position: 1,
        isFlexible: false
      });
    }
  } else if (cards.length === 2) {
    // Two cards - determine type
    const [card1, card2] = cards;
    const keyword1 = detectKeyword(card1.oracleText, card1.typeLine);
    const keyword2 = detectKeyword(card2.oracleText, card2.typeLine);
    
    // Sort alphabetically for canonical key
    const sorted = [...cards].sort((a, b) => a.name.localeCompare(b.name));
    
    // Check for background combo
    if (keyword1.keyword === 'background_chooser' && keyword2.keyword === 'background') {
      commanderType = 'background';
      commanderCards.push({
        cardName: card1.name,
        role: 'commander',
        position: 1,
        isFlexible: false
      });
      commanderCards.push({
        cardName: card2.name,
        role: 'background',
        position: 2,
        isFlexible: false
      });
    } else if (keyword2.keyword === 'background_chooser' && keyword1.keyword === 'background') {
      commanderType = 'background';
      commanderCards.push({
        cardName: card2.name,
        role: 'commander',
        position: 1,
        isFlexible: false
      });
      commanderCards.push({
        cardName: card1.name,
        role: 'background',
        position: 2,
        isFlexible: false
      });
    }
    // Check for partner_with combo
    else if (keyword1.keyword === 'partner_with' || keyword2.keyword === 'partner_with') {
      commanderType = 'partner_with';
      commanderCards.push({
        cardName: sorted[0].name,
        role: 'partner',
        position: 1,
        isFlexible: false
      });
      commanderCards.push({
        cardName: sorted[1].name,
        role: 'partner',
        position: 2,
        isFlexible: false
      });
    }
    // Check for friends forever
    else if (keyword1.keyword === 'friends_forever' && keyword2.keyword === 'friends_forever') {
      commanderType = 'friends_forever';
      commanderCards.push({
        cardName: sorted[0].name,
        role: 'partner',
        position: 1,
        isFlexible: false
      });
      commanderCards.push({
        cardName: sorted[1].name,
        role: 'partner',
        position: 2,
        isFlexible: false
      });
    }
    // Check for generic partner
    else if (keyword1.keyword === 'partner' && keyword2.keyword === 'partner') {
      commanderType = 'partner';
      commanderCards.push({
        cardName: sorted[0].name,
        role: 'partner',
        position: 1,
        isFlexible: false
      });
      commanderCards.push({
        cardName: sorted[1].name,
        role: 'partner',
        position: 2,
        isFlexible: false
      });
    }
    // Could be oathbreaker (planeswalker + instant/sorcery)
    else if (
      (card1.typeLine.includes('Planeswalker') && (card2.typeLine.includes('Instant') || card2.typeLine.includes('Sorcery'))) ||
      (card2.typeLine.includes('Planeswalker') && (card1.typeLine.includes('Instant') || card1.typeLine.includes('Sorcery')))
    ) {
      commanderType = 'oathbreaker';
      const [oathbreaker, spell] = card1.typeLine.includes('Planeswalker') ? [card1, card2] : [card2, card1];
      commanderCards.push({
        cardName: oathbreaker.name,
        role: 'oathbreaker',
        position: 1,
        isFlexible: false
      });
      commanderCards.push({
        cardName: spell.name,
        role: 'signature_spell',
        position: 2,
        isFlexible: false
      });
    }
    // Fallback: treat as partner (may be content error)
    else {
      commanderType = 'partner';
      commanderCards.push({
        cardName: sorted[0].name,
        role: 'partner',
        position: 1,
        isFlexible: false
      });
      commanderCards.push({
        cardName: sorted[1].name,
        role: 'partner',
        position: 2,
        isFlexible: false
      });
    }
  }
  
  // Build canonical key
  let canonicalKey: string;
  if (commanderType === 'background' || commanderType === 'background_flex' || commanderType === 'oathbreaker') {
    // Use + separator
    canonicalKey = commanderCards.map(c => slugify(c.cardName)).join('+');
  } else if (commanderCards.length > 1) {
    // Use // separator, sorted alphabetically
    const sortedSlugs = commanderCards.map(c => slugify(c.cardName)).sort();
    canonicalKey = sortedSlugs.join('//');
  } else {
    canonicalKey = slugify(commanderCards[0].cardName);
  }
  
  // Build display name
  let displayName: string;
  if (commanderType === 'background' || commanderType === 'background_flex') {
    displayName = commanderCards.map(c => c.cardName).join(' + ');
  } else if (commanderType === 'oathbreaker') {
    displayName = commanderCards.map(c => c.cardName).join(' + ');
  } else if (commanderCards.length > 1) {
    displayName = commanderCards.map(c => c.cardName).join(' & ');
  } else {
    displayName = commanderCards[0].cardName;
  }
  
  // Combine color identity
  const colorIdentity = combineColorIdentity(cards.map(c => c.colorIdentity));
  
  return {
    canonicalKey,
    displayName,
    colorIdentity,
    commanderType,
    cards: commanderCards,
    legalCommander: commanderType !== 'oathbreaker',
    legalOathbreaker: commanderType === 'oathbreaker',
    legalBrawl: commanderType === 'single'
  };
}

/**
 * Save a resolved commander to the database
 */
export async function saveCommander(commander: ResolvedCommander): Promise<string | null> {
  const supabase = getSupabaseClient();
  
  // Check if already exists
  const { data: existing } = await supabase
    .from('ref_commanders')
    .select('id')
    .eq('canonical_key', commander.canonicalKey)
    .single();
  
  if (existing) {
    return existing.id;
  }
  
  // Insert commander
  const { data: inserted, error: insertError } = await supabase
    .from('ref_commanders')
    .insert({
      canonical_key: commander.canonicalKey,
      display_name: commander.displayName,
      color_identity: commander.colorIdentity,
      leadership_type: commander.commanderType,
      legal_commander: commander.legalCommander,
      legal_oathbreaker: commander.legalOathbreaker,
      legal_brawl: commander.legalBrawl
    })
    .select('id')
    .single();
  
  if (insertError || !inserted) {
    console.error('Failed to insert commander:', insertError);
    return null;
  }
  
  // Insert commander cards
  const cardInserts = commander.cards.map(card => ({
    commander_id: inserted.id,
    card_name: card.cardName,
    card_role: card.role,
    position: card.position,
    is_flexible: card.isFlexible
  }));
  
  const { error: cardsError } = await supabase
    .from('ref_commander_cards')
    .insert(cardInserts);
  
  if (cardsError) {
    console.error('Failed to insert commander cards:', cardsError);
    // Rollback commander
    await supabase.from('ref_commanders').delete().eq('id', inserted.id);
    return null;
  }
  
  return inserted.id;
}

/**
 * Find or create a commander from a raw commander string
 */
export async function findOrCreateCommander(raw: string): Promise<string | null> {
  const resolved = await resolveCommander(raw);
  if (!resolved) {
    return null;
  }
  
  return saveCommander(resolved);
}

/**
 * Look up an existing commander by canonical key
 */
export async function lookupCommanderByKey(canonicalKey: string): Promise<ResolvedCommander | null> {
  const supabase = getSupabaseClient();
  
  const { data: commander } = await supabase
    .from('ref_commanders')
    .select(`
      id,
      canonical_key,
      display_name,
      color_identity,
      leadership_type,
      legal_commander,
      legal_oathbreaker,
      legal_brawl,
      ref_commander_cards (
        card_name,
        card_role,
        position,
        is_flexible
      )
    `)
    .eq('canonical_key', canonicalKey)
    .single();
  
  if (!commander) {
    return null;
  }
  
  return {
    canonicalKey: commander.canonical_key,
    displayName: commander.display_name,
    colorIdentity: commander.color_identity,
    commanderType: commander.leadership_type as CommanderType,
    cards: commander.ref_commander_cards.map(c => ({
      cardName: c.card_name,
      role: c.card_role as CardRole,
      position: c.position,
      isFlexible: c.is_flexible ?? false
    })),
    legalCommander: commander.legal_commander ?? true,
    legalOathbreaker: commander.legal_oathbreaker ?? false,
    legalBrawl: commander.legal_brawl ?? false
  };
}

// Backwards-compatible exports for migration period
export type LeadershipType = CommanderType;
export type ResolvedLeadership = ResolvedCommander;
export type LeadershipCard = CommanderCard;
export const resolveLeadership = resolveCommander;
export const saveLeadership = saveCommander;
export const findOrCreateLeadership = findOrCreateCommander;
export const lookupLeadershipByKey = lookupCommanderByKey;
