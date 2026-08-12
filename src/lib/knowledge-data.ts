/**
 * Knowledge File Loader
 * 
 * Provides access to curated knowledge files for archetypes, themes, tribes,
 * mechanics, rules, and deck fundamentals. These files contain expert-written
 * guides that help the AI understand deck building strategies.
 * 
 * Data source: data/knowledge/
 * 
 * The index is loaded once and cached. Individual files are loaded on demand
 * and cached for the server lifetime.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnowledgeFileEntry {
  name: string
  path: string
  topics: string[]
}

export interface KnowledgeCategory {
  description: string
  files: KnowledgeFileEntry[]
}

export interface KnowledgeIndex {
  version: string
  lastUpdated: string
  taxonomy: Record<string, string>
  categories: Record<string, KnowledgeCategory>
}

export type CategoryName = 
  | 'rules' 
  | 'fundamentals' 
  | 'themes' 
  | 'archetypes' 
  | 'mechanics' 
  | 'tribes' 
  | 'colors'

// ---------------------------------------------------------------------------
// Index Loading (Lazy, Cached)
// ---------------------------------------------------------------------------

let cachedIndex: KnowledgeIndex | null = null
const fileCache = new Map<string, string>()

function getKnowledgeBasePath(): string {
  return resolve(process.cwd(), 'data/knowledge')
}

/**
 * Load the knowledge index.
 */
export function loadKnowledgeIndex(): KnowledgeIndex {
  if (cachedIndex) return cachedIndex

  try {
    const indexPath = resolve(getKnowledgeBasePath(), 'index.json')
    const content = readFileSync(indexPath, 'utf-8')
    cachedIndex = JSON.parse(content) as KnowledgeIndex
    return cachedIndex
  } catch (error) {
    console.error('[knowledge] Failed to load index:', error)
    // Return minimal fallback
    cachedIndex = {
      version: '0.0.0',
      lastUpdated: '',
      taxonomy: {},
      categories: {},
    }
    return cachedIndex
  }
}

// ---------------------------------------------------------------------------
// File Loading
// ---------------------------------------------------------------------------

/**
 * Load a specific knowledge file by path.
 * Returns the markdown content.
 */
export function loadKnowledgeFile(filePath: string): string | null {
  // Check cache first
  if (fileCache.has(filePath)) {
    return fileCache.get(filePath)!
  }

  try {
    const fullPath = resolve(getKnowledgeBasePath(), filePath)
    if (!existsSync(fullPath)) {
      console.warn(`[knowledge] File not found: ${filePath}`)
      return null
    }

    const content = readFileSync(fullPath, 'utf-8')
    fileCache.set(filePath, content)
    return content
  } catch (error) {
    console.error(`[knowledge] Failed to load file ${filePath}:`, error)
    return null
  }
}

/**
 * Load a knowledge file by category and name.
 * E.g., loadByCategory('archetypes', 'aristocrats')
 */
export function loadByCategory(
  category: CategoryName,
  name: string
): string | null {
  const index = loadKnowledgeIndex()
  const cat = index.categories[category]
  
  if (!cat) {
    console.warn(`[knowledge] Category not found: ${category}`)
    return null
  }

  // Find file by name (with or without .md extension)
  const normalizedName = name.toLowerCase().replace(/\.md$/, '')
  const file = cat.files.find(f => 
    f.name.toLowerCase().replace(/\.md$/, '') === normalizedName
  )

  if (!file) {
    console.warn(`[knowledge] File not found in ${category}: ${name}`)
    return null
  }

  return loadKnowledgeFile(file.path)
}

// ---------------------------------------------------------------------------
// Convenience Loaders
// ---------------------------------------------------------------------------

/**
 * Load an archetype guide by name.
 * E.g., loadArchetype('aristocrats')
 */
export function loadArchetype(name: string): string | null {
  return loadByCategory('archetypes', name)
}

/**
 * Load a theme guide by name.
 * E.g., loadTheme('sacrifice')
 */
export function loadTheme(name: string): string | null {
  return loadByCategory('themes', name)
}

/**
 * Load a tribe guide by name.
 * E.g., loadTribe('zombies')
 */
export function loadTribe(name: string): string | null {
  return loadByCategory('tribes', name)
}

/**
 * Load a mechanics guide by name.
 * E.g., loadMechanic('cascade')
 */
export function loadMechanic(name: string): string | null {
  return loadByCategory('mechanics', name)
}

/**
 * Load deck fundamentals guide.
 */
export function loadDeckFundamentals(): string | null {
  return loadByCategory('fundamentals', 'deck-anatomy')
}

/**
 * Load commander rules summary.
 */
export function loadCommanderRules(): string | null {
  return loadByCategory('rules', 'commander-rules')
}

// ---------------------------------------------------------------------------
// Search & Discovery
// ---------------------------------------------------------------------------

/**
 * List all available files in a category.
 */
export function listCategory(category: CategoryName): KnowledgeFileEntry[] {
  const index = loadKnowledgeIndex()
  return index.categories[category]?.files ?? []
}

/**
 * List all available archetypes.
 */
export function listArchetypes(): string[] {
  return listCategory('archetypes').map(f => f.name.replace(/\.md$/, ''))
}

/**
 * List all available themes.
 */
export function listThemes(): string[] {
  return listCategory('themes').map(f => f.name.replace(/\.md$/, ''))
}

/**
 * List all available tribes.
 */
export function listTribes(): string[] {
  return listCategory('tribes').map(f => f.name.replace(/\.md$/, ''))
}

/**
 * Find knowledge files matching a topic.
 * Searches across all categories.
 */
export function findByTopic(topic: string): Array<{
  category: string
  file: KnowledgeFileEntry
}> {
  const index = loadKnowledgeIndex()
  const normalizedTopic = topic.toLowerCase()
  const results: Array<{ category: string; file: KnowledgeFileEntry }> = []

  for (const [categoryName, category] of Object.entries(index.categories)) {
    for (const file of category.files) {
      const matchesName = file.name.toLowerCase().includes(normalizedTopic)
      const matchesTopic = file.topics.some(t => 
        t.toLowerCase().includes(normalizedTopic)
      )
      
      if (matchesName || matchesTopic) {
        results.push({ category: categoryName, file })
      }
    }
  }

  return results
}

/**
 * Find the best matching archetype for a strategy description.
 * Returns archetype name and match score.
 */
export function findArchetypeForStrategy(
  strategyKeywords: string[]
): { archetype: string; score: number } | null {
  const index = loadKnowledgeIndex()
  const archetypes = index.categories.archetypes?.files ?? []
  
  let bestMatch: { archetype: string; score: number } | null = null

  for (const file of archetypes) {
    const archetypeName = file.name.replace(/\.md$/, '')
    let score = 0

    for (const keyword of strategyKeywords) {
      const normalizedKeyword = keyword.toLowerCase()
      
      // Check if keyword matches archetype name
      if (archetypeName.toLowerCase().includes(normalizedKeyword)) {
        score += 3
      }
      
      // Check if keyword matches any topic
      for (const topic of file.topics) {
        if (topic.toLowerCase().includes(normalizedKeyword)) {
          score += 2
        }
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { archetype: archetypeName, score }
    }
  }

  return bestMatch
}

// ---------------------------------------------------------------------------
// Prompt Formatting
// ---------------------------------------------------------------------------

/**
 * Format a knowledge file for inclusion in an AI prompt.
 * Adds context header and trims to a max length if needed.
 */
export function formatForPrompt(
  content: string,
  options?: {
    category?: string
    name?: string
    maxChars?: number
  }
): string {
  const lines: string[] = []

  if (options?.category && options?.name) {
    lines.push(`## ${options.category}: ${options.name}`)
    lines.push('')
  }

  // Trim if needed
  let body = content
  const maxChars = options?.maxChars ?? 8000
  
  if (body.length > maxChars) {
    body = body.slice(0, maxChars)
    // Cut at last complete paragraph
    const lastParagraph = body.lastIndexOf('\n\n')
    if (lastParagraph > maxChars * 0.7) {
      body = body.slice(0, lastParagraph)
    }
    body += '\n\n[... truncated for brevity]'
  }

  lines.push(body)
  return lines.join('\n')
}

/**
 * Load and format an archetype guide for AI prompt.
 */
export function getArchetypePromptContext(archetype: string): string | null {
  const content = loadArchetype(archetype)
  if (!content) return null

  return formatForPrompt(content, {
    category: 'Archetype Guide',
    name: archetype,
    maxChars: 6000,
  })
}

/**
 * Load and format a theme guide for AI prompt.
 */
export function getThemePromptContext(theme: string): string | null {
  const content = loadTheme(theme)
  if (!content) return null

  return formatForPrompt(content, {
    category: 'Theme Guide',
    name: theme,
    maxChars: 4000,
  })
}

/**
 * Load and format deck fundamentals for AI prompt.
 */
export function getFundamentalsPromptContext(): string | null {
  const content = loadDeckFundamentals()
  if (!content) return null

  return formatForPrompt(content, {
    category: 'Deck Building Fundamentals',
    name: 'Core Concepts',
    maxChars: 5000,
  })
}

/**
 * Load multiple related knowledge files for a brew context.
 * Returns combined context with all relevant guides.
 */
export function getBrewContext(params: {
  archetype?: string
  theme?: string
  tribe?: string
  includeFundamentals?: boolean
}): string {
  const sections: string[] = []

  // Always include fundamentals first if requested
  if (params.includeFundamentals) {
    const fundamentals = getFundamentalsPromptContext()
    if (fundamentals) {
      sections.push(fundamentals)
    }
  }

  // Add archetype guide
  if (params.archetype) {
    const archetypeGuide = getArchetypePromptContext(params.archetype)
    if (archetypeGuide) {
      sections.push(archetypeGuide)
    }
  }

  // Add theme guide
  if (params.theme) {
    const themeGuide = getThemePromptContext(params.theme)
    if (themeGuide) {
      sections.push(themeGuide)
    }
  }

  // Add tribe guide
  if (params.tribe) {
    const tribeContent = loadTribe(params.tribe)
    if (tribeContent) {
      sections.push(formatForPrompt(tribeContent, {
        category: 'Tribe Guide',
        name: params.tribe,
        maxChars: 3000,
      }))
    }
  }

  return sections.join('\n\n---\n\n')
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Get statistics about available knowledge files.
 */
export function getKnowledgeStats(): {
  totalFiles: number
  byCategory: Record<string, number>
} {
  const index = loadKnowledgeIndex()
  const byCategory: Record<string, number> = {}
  let totalFiles = 0

  for (const [categoryName, category] of Object.entries(index.categories)) {
    byCategory[categoryName] = category.files.length
    totalFiles += category.files.length
  }

  return { totalFiles, byCategory }
}
