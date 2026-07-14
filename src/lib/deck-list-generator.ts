/**
 * Deck List Generator
 *
 * Pure function that takes structured deck card data and produces
 * formatted markdown for the "Current Deck List" toggle section.
 *
 * Also provides queryDeckListData — the data assembly layer that
 * queries deck_cards and physical_copies to build
 * the DeckListInput for a given deck.
 */



// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeckListCard {
  cardName: string
  category: string
  setCode: string | null
  collectorNumber: string | null
  status: 'Original' | 'Proxy'
  isCommander: boolean
  quantity: number
}

export interface DeckListInput {
  cards: DeckListCard[]
}

export interface DeckListOutput {
  markdown: string
  totalCards: number
  proxyCount: number
  categoryGroups: CategoryGroup[]
}

export interface CategoryGroup {
  name: string
  cards: DeckListCard[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape pipe characters in a string to prevent broken markdown tables.
 */
function escapePipes(value: string): string {
  return value.replace(/\|/g, '\\|')
}

/**
 * Group cards into CategoryGroup[], with Commander always first,
 * remaining groups sorted alphabetically, and cards sorted
 * alphabetically within each group.
 */
function buildCategoryGroups(cards: DeckListCard[]): CategoryGroup[] {
  const commanderCards: DeckListCard[] = []
  const groupMap = new Map<string, DeckListCard[]>()

  for (const card of cards) {
    if (card.isCommander) {
      commanderCards.push(card)
    } else {
      const existing = groupMap.get(card.category)
      if (existing) {
        existing.push(card)
      } else {
        groupMap.set(card.category, [card])
      }
    }
  }

  // Sort cards alphabetically within each group
  const sortCards = (a: DeckListCard, b: DeckListCard) =>
    a.cardName.localeCompare(b.cardName)

  commanderCards.sort(sortCards)

  const groups: CategoryGroup[] = []

  // Commander group always first (only if there are commander cards)
  if (commanderCards.length > 0) {
    groups.push({ name: 'Commander', cards: commanderCards })
  }

  // Remaining groups sorted alphabetically by name
  const sortedGroupNames = Array.from(groupMap.keys()).sort((a, b) =>
    a.localeCompare(b)
  )

  for (const name of sortedGroupNames) {
    const groupCards = groupMap.get(name)!
    groupCards.sort(sortCards)
    groups.push({ name, cards: groupCards })
  }

  return groups
}

/**
 * Render a single category group as a ### heading + markdown table.
 * Each line of toggle content is indented with \t.
 */
function renderCategoryGroup(group: CategoryGroup): string {
  const lines: string[] = []

  lines.push(`\t### ${group.name}`)
  lines.push(`\t| Card | Set | # | Status |`)
  lines.push(`\t|------|-----|---|--------|`)

  for (const card of group.cards) {
    const name = escapePipes(card.cardName)
    const set = card.setCode ?? ''
    const num = card.collectorNumber ?? ''
    const status = card.status
    lines.push(`\t| ${name} | ${set} | ${num} | ${status} |`)
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

/**
 * Generate the complete deck list markdown section.
 *
 * Renders a single flat table with columns: Card, Category, Set, #, Status
 * Sorted by: Commander first, then category alphabetical, then card name alphabetical within category.
 * Includes a total count row at the bottom.
 *
 * Pure function — no I/O, fully deterministic for same input.
 */
export function generateDeckListMarkdown(input: DeckListInput): DeckListOutput {
  const { cards } = input

  const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0)
  const proxyCount = cards.filter((c) => c.status === 'Proxy').reduce((sum, c) => sum + c.quantity, 0)
  const categoryGroups = buildCategoryGroups(cards)

  // Flatten groups back into sorted card order for the single table
  const sortedCards: DeckListCard[] = []
  for (const group of categoryGroups) {
    for (const card of group.cards) {
      sortedCards.push(card)
    }
  }

  // Build the markdown output
  const lines: string[] = []

  // Toggle heading
  lines.push('## Current Deck List')

  // Summary line (indented for toggle content)
  lines.push(`\t${totalCards} cards • ${proxyCount} proxies`)

  // Single flat table with Qty as first column
  lines.push(`\t| Qty | Card | Category | Set | Status |`)
  lines.push(`\t|-----|------|----------|-----|--------|`)

  for (const card of sortedCards) {
    const name = escapePipes(card.cardName)
    const category = escapePipes(card.isCommander ? 'Commander' : card.category)
    const qty = card.quantity
    const set = card.setCode ?? ''
    const status = card.status
    lines.push(`\t| ${qty} | ${name} | ${category} | ${set} | ${status} |`)
  }

  // Total row at the bottom
  lines.push(`\t| **${totalCards}** | **Total** | | | **${proxyCount} proxies** |`)

  const markdown = lines.join('\n')

  return {
    markdown,
    totalCards,
    proxyCount,
    categoryGroups,
  }
}

// ---------------------------------------------------------------------------
// Data Assembly (Query Layer)
// ---------------------------------------------------------------------------
// NOTE: queryDeckListData was removed during Supabase migration (task 14).
// The SQLite-based query function is no longer needed — deck list data is now
// fetched via Supabase in the API routes. The pure generateDeckListMarkdown()
// function above remains for formatting.
