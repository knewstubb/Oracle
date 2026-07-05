/**
 * Archidekt Playwright Adapter
 *
 * Browser automation for writing to Archidekt via the "Import Cards" text
 * interface. Archidekt has no public API for tag writes, so we use Playwright
 * to manipulate the text-based import/export screen.
 *
 * ## Architecture
 *
 * Two layers:
 * 1. **Pure text manipulation** (addProxyTag, removeProxyTag) — no browser needed
 * 2. **Browser automation** (navigateToImportCards, readImportText, etc.) — Playwright
 *
 * ## Archidekt Import Cards Format
 * ```
 * 1x Card Name (set) [Category1,Category2] ^TagName,#hexcolour^
 * ```
 *
 * ## Authentication
 * Uses a persistent browser context so the user logs in once and the session
 * is reused. The browser launches non-headless for the initial login.
 */

import { chromium, type BrowserContext, type Page } from 'playwright'
import path from 'path'

// ---------------------------------------------------------------------------
// Proxy tag and category constants
// ---------------------------------------------------------------------------

export const PROXY_TAG = '^Proxy,#e158ff^'
export const PROXY_CATEGORY = 'Proxy'

// ---------------------------------------------------------------------------
// Pure text manipulation functions (no Playwright dependency)
// ---------------------------------------------------------------------------

function buildCardLineRegex(cardName: string): RegExp {
  const escaped = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^(\\d+x\\s+${escaped})(.*)$`, 'im')
}

export function addProxyTag(text: string, cardName: string): string {
  const regex = buildCardLineRegex(cardName)
  const match = text.match(regex)

  if (!match) return text

  const fullLine = match[0]
  if (fullLine.includes(PROXY_TAG)) return text

  const updatedLine = fullLine.trimEnd() + '  ' + PROXY_TAG
  return text.replace(fullLine, updatedLine)
}

export function removeProxyTag(text: string, cardName: string): string {
  const regex = buildCardLineRegex(cardName)
  const match = text.match(regex)

  if (!match) return text

  const fullLine = match[0]
  if (!fullLine.includes(PROXY_TAG)) return text

  const updatedLine = fullLine.replace(/\s*\^Proxy,#e158ff\^/, '').trimEnd()
  return text.replace(fullLine, updatedLine)
}

// ---------------------------------------------------------------------------
// Proxy category text manipulation functions (no Playwright dependency)
// ---------------------------------------------------------------------------

/**
 * Add "Proxy" to a card's category bracket in the Import Text format.
 * If the card has no categories, adds [Proxy].
 * If the card already has categories [Ramp], it becomes [Ramp,Proxy].
 * If the card already has "Proxy" in its categories, this is a no-op.
 */
export function addProxyCategory(text: string, cardName: string): string {
  const regex = buildCardLineRegex(cardName)
  const match = text.match(regex)

  if (!match) return text

  const fullLine = match[0]

  // Check if line already has a category bracket with "Proxy" in it
  const categoryMatch = fullLine.match(/\[([^\]]*)\]/)
  if (categoryMatch) {
    const categories = categoryMatch[1].split(',').map(c => c.trim())
    if (categories.includes(PROXY_CATEGORY)) return text // Already has Proxy

    // Append Proxy to existing categories
    const newCategories = `[${categoryMatch[1]},${PROXY_CATEGORY}]`
    const updatedLine = fullLine.replace(categoryMatch[0], newCategories)
    return text.replace(fullLine, updatedLine)
  }

  // No category bracket exists — insert [Proxy] after the card name/set portion
  // Position: after quantity + card name (+ optional set code), before tags
  // The card line regex captures: group1 = "1x CardName", group2 = rest
  const prefix = match[1] // e.g. "1x Sol Ring"
  const rest = match[2]   // e.g. " (c21)  ^Proxy,#e158ff^"

  // Insert [Proxy] after set code if present, otherwise after card name
  const setMatch = rest.match(/^(\s*\([^)]+\))(.*)$/)
  if (setMatch) {
    const updatedLine = prefix + setMatch[1] + ` [${PROXY_CATEGORY}]` + setMatch[2]
    return text.replace(fullLine, updatedLine)
  }

  // No set code — insert [Proxy] right after card name, before any tags
  const tagStart = rest.search(/\s*\^/)
  if (tagStart >= 0) {
    const updatedLine = prefix + ` [${PROXY_CATEGORY}]` + rest.slice(tagStart)
    return text.replace(fullLine, updatedLine)
  }

  // Nothing else on the line — just append [Proxy]
  const updatedLine = fullLine.trimEnd() + ` [${PROXY_CATEGORY}]`
  return text.replace(fullLine, updatedLine)
}

/**
 * Remove "Proxy" from a card's categories in the Import Text format.
 * [Ramp,Proxy] becomes [Ramp].
 * [Proxy] is removed entirely (the whole bracket is removed).
 * If the card has no "Proxy" category, this is a no-op.
 */
export function removeProxyCategory(text: string, cardName: string): string {
  const regex = buildCardLineRegex(cardName)
  const match = text.match(regex)

  if (!match) return text

  const fullLine = match[0]

  // Find the category bracket
  const categoryMatch = fullLine.match(/\[([^\]]*)\]/)
  if (!categoryMatch) return text // No categories, nothing to remove

  const categories = categoryMatch[1].split(',').map(c => c.trim())
  if (!categories.includes(PROXY_CATEGORY)) return text // No Proxy category

  // Remove "Proxy" from the list
  const remaining = categories.filter(c => c !== PROXY_CATEGORY)

  let updatedLine: string
  if (remaining.length === 0) {
    // Remove the entire bracket (and any leading whitespace before it)
    updatedLine = fullLine.replace(/\s*\[[^\]]*\]/, '')
  } else {
    // Replace with remaining categories
    const newCategories = `[${remaining.join(',')}]`
    updatedLine = fullLine.replace(categoryMatch[0], newCategories)
  }

  return text.replace(fullLine, updatedLine)
}

/**
 * Combined operation: set both Proxy label AND Proxy category.
 * This is what the allocation system calls when marking a slot as proxy.
 */
export function markAsProxy(text: string, cardName: string): string {
  let result = addProxyTag(text, cardName)
  result = addProxyCategory(result, cardName)
  return result
}

/**
 * Combined operation: remove both Proxy label AND Proxy category.
 * This is what the allocation system calls when a proxy slot becomes fulfilled.
 */
export function unmarkAsProxy(text: string, cardName: string): string {
  let result = removeProxyTag(text, cardName)
  result = removeProxyCategory(result, cardName)
  return result
}

// ---------------------------------------------------------------------------
// Browser automation — persistent context management
// ---------------------------------------------------------------------------

const SESSION_DIR = path.resolve(process.cwd(), 'data', 'playwright-session')
const ARCHIDEKT_BASE = 'https://archidekt.com'
const NAV_TIMEOUT = 30_000
const ACTION_TIMEOUT = 10_000

let browserContext: BrowserContext | null = null

/**
 * Get or create a persistent browser context.
 * The persistent context stores cookies/session so the user only logs in once.
 */
export async function getContext(): Promise<BrowserContext> {
  if (browserContext) return browserContext

  browserContext = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  })

  // Clean up reference when context closes
  browserContext.on('close', () => {
    browserContext = null
  })

  return browserContext
}

/**
 * Close the browser context and release resources.
 */
export async function closeContext(): Promise<void> {
  if (browserContext) {
    await browserContext.close()
    browserContext = null
  }
}

/**
 * Get the active page or create a new one.
 */
async function getPage(ctx: BrowserContext): Promise<Page> {
  const pages = ctx.pages()
  return pages.length > 0 ? pages[0] : await ctx.newPage()
}

// ---------------------------------------------------------------------------
// Browser automation functions
// ---------------------------------------------------------------------------

/**
 * Navigate to a deck's Import Cards page in Archidekt.
 *
 * Flow:
 * 1. Navigate to the deck edit page
 * 2. Wait for page load
 * 3. Click the "Import" tab to reveal the textarea
 * 4. Wait for the textarea to be visible
 */
export async function navigateToImportCards(deckId: number): Promise<Page> {
  const ctx = await getContext()
  const page = await getPage(ctx)

  const url = `${ARCHIDEKT_BASE}/decks/${deckId}/edit`
  console.log(`[archidekt-pw] Navigating to ${url}`)
  await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT })

  // Check for login redirect — if we're not on the edit page, session expired
  if (page.url().includes('/login') || page.url().includes('/signin')) {
    throw new Error(
      'Archidekt session expired. Please log in manually in the browser window and retry.'
    )
  }

  // Click the Import tab — try multiple selectors
  const importTab = page.getByRole('tab', { name: /import/i })
    .or(page.getByRole('button', { name: /import/i }))
    .or(page.locator('text=Import'))
  
  await importTab.first().click({ timeout: ACTION_TIMEOUT })
  console.log('[archidekt-pw] Clicked Import tab')

  // Wait for textarea to appear
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: ACTION_TIMEOUT })
  console.log('[archidekt-pw] Import textarea visible')

  return page
}

/**
 * Read the current text content from the Import Cards textarea.
 * Prerequisite: navigateToImportCards() has been called and returned the page.
 */
export async function readImportText(page: Page): Promise<string> {
  const textarea = page.locator('textarea').first()
  await textarea.waitFor({ state: 'visible', timeout: ACTION_TIMEOUT })

  const value = await textarea.inputValue()
  console.log(`[archidekt-pw] Read ${value.split('\n').length} lines from textarea`)
  return value
}

/**
 * Replace the Import Cards textarea content with new text.
 * Prerequisite: navigateToImportCards() has been called and returned the page.
 */
export async function writeImportText(page: Page, text: string): Promise<void> {
  const textarea = page.locator('textarea').first()
  await textarea.waitFor({ state: 'visible', timeout: ACTION_TIMEOUT })

  // Clear existing content and fill with new text
  await textarea.click()
  await textarea.fill(text)
  console.log(`[archidekt-pw] Wrote ${text.split('\n').length} lines to textarea`)
}

/**
 * Click the Save/Import button to commit the changes.
 * Checks for error indicators after saving.
 */
export async function saveChanges(page: Page): Promise<void> {
  // Find the save/import button
  const saveButton = page.getByRole('button', { name: /save|import/i })
    .or(page.locator('button:has-text("Save")'))
    .or(page.locator('button:has-text("Import")'))

  await saveButton.first().click({ timeout: ACTION_TIMEOUT })
  console.log('[archidekt-pw] Clicked save button')

  // Wait for the save to process
  await page.waitForTimeout(2000)

  // Check for error indicators
  const errorAlert = page.locator('[role="alert"]')
    .or(page.locator('.error'))
    .or(page.locator('.alert-danger'))

  const hasError = await errorAlert.first().isVisible().catch(() => false)
  if (hasError) {
    const errorText = await errorAlert.first().textContent().catch(() => 'Unknown error')
    throw new Error(`Archidekt save failed: ${errorText}`)
  }

  console.log('[archidekt-pw] Save completed successfully')
}

// ---------------------------------------------------------------------------
// Retry and error classification
// ---------------------------------------------------------------------------

const MAX_RETRIES = 1
const RETRYABLE_ERROR_PATTERNS = ['timeout', 'TimeoutError', 'net::ERR_', 'ETIMEDOUT', 'ECONNRESET']

/**
 * Determine if an error is transient and worth retrying (e.g., timeouts, network errors).
 */
export function isRetryableError(error: string): boolean {
  return RETRYABLE_ERROR_PATTERNS.some(pattern =>
    error.toLowerCase().includes(pattern.toLowerCase())
  )
}

/**
 * Determine if an error indicates an authentication/session failure.
 * Auth errors should NOT be retried — they require manual user intervention.
 */
export function isAuthError(error: string): boolean {
  const authPatterns = ['session expired', 'login', 'signin', '401', '403', 'unauthorized']
  return authPatterns.some(pattern =>
    error.toLowerCase().includes(pattern.toLowerCase())
  )
}

// ---------------------------------------------------------------------------
// Read-back verification
// ---------------------------------------------------------------------------

/**
 * Verify that a proxy tag is present (or absent) for a given card in the textarea.
 * Call this after saving changes to confirm the write actually persisted.
 *
 * @param page - The Playwright page with the Import Cards textarea visible
 * @param cardName - The card name to check
 * @param expectedPresent - true if the tag should be present, false if it should be absent
 * @returns true if the textarea state matches expectations, false otherwise
 */
export async function verifyProxyTag(
  page: Page,
  cardName: string,
  expectedPresent: boolean
): Promise<boolean> {
  const text = await readImportText(page)
  const regex = buildCardLineRegex(cardName)
  const match = text.match(regex)

  if (!match) {
    // Card not found in textarea at all — tag cannot be present
    return !expectedPresent
  }

  const fullLine = match[0]
  const hasTag = fullLine.includes(PROXY_TAG)
  return hasTag === expectedPresent
}

// ---------------------------------------------------------------------------
// High-level orchestration
// ---------------------------------------------------------------------------

export interface ProxyTagChange {
  cardName: string
  action: 'add' | 'remove'
}

export interface UpdateResult {
  success: boolean
  error?: string
  changesApplied?: number
  verificationResults?: Array<{
    cardName: string
    verified: boolean
  }>
}

export interface CreateDeckResult {
  success: boolean
  url?: string
  error?: string
}

/**
 * High-level function that orchestrates the full proxy tag update flow for a deck.
 *
 * **Batch behaviour:** This function accepts an array of changes and processes them
 * all in a single navigation. Regardless of whether you pass 1 or 50 changes, the
 * function navigates to the deck's Import Cards page exactly once, reads the text,
 * applies ALL changes to the in-memory text, writes once, and saves once. Callers
 * should batch all changes for the same deck into a single call rather than calling
 * this function multiple times.
 *
 * **Retry logic:** Transient errors (timeouts, network failures) are retried once.
 * Authentication errors (session expired, login redirect) fail immediately without retry.
 *
 * **Verification:** After a successful save, the function re-reads the textarea and
 * confirms each change was actually applied. Verification results are included in
 * the response.
 *
 * Flow:
 * 1. Navigate to Import Cards (single navigation for all changes)
 * 2. Read current text
 * 3. Apply addProxyTag/removeProxyTag for each change in the batch
 * 4. Write modified text (single write)
 * 5. Save changes (single save)
 * 6. Verify each change was applied via read-back
 * 7. Return success/failure with verification details
 */
export async function updateProxyTags(
  deckId: number,
  changes: ProxyTagChange[]
): Promise<UpdateResult> {
  let lastError = ''

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 1. Navigate to the deck's Import Cards page
      const page = await navigateToImportCards(deckId)

      // 2. Read current text
      const originalText = await readImportText(page)

      // 3. Apply changes
      let modifiedText = originalText
      let changesApplied = 0

      for (const change of changes) {
        const before = modifiedText
        if (change.action === 'add') {
          modifiedText = addProxyTag(modifiedText, change.cardName)
        } else {
          modifiedText = removeProxyTag(modifiedText, change.cardName)
        }
        if (modifiedText !== before) {
          changesApplied++
        }
      }

      // If nothing changed, skip the write
      if (modifiedText === originalText) {
        console.log('[archidekt-pw] No changes needed — text unchanged')
        return { success: true, changesApplied: 0 }
      }

      // 4. Write modified text
      await writeImportText(page, modifiedText)

      // 5. Save changes
      await saveChanges(page)

      // 6. Verify each change via read-back
      const verificationResults: Array<{ cardName: string; verified: boolean }> = []
      for (const change of changes) {
        const expectedPresent = change.action === 'add'
        const verified = await verifyProxyTag(page, change.cardName, expectedPresent)
        verificationResults.push({ cardName: change.cardName, verified })
        if (!verified) {
          console.warn(
            `[archidekt-pw] Verification failed for "${change.cardName}" — expected tag ${expectedPresent ? 'present' : 'absent'}`
          )
        }
      }

      return { success: true, changesApplied, verificationResults }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      lastError = message

      // Auth errors fail immediately — no retry
      if (isAuthError(message)) {
        console.error(`[archidekt-pw] Auth error — not retrying: ${message}`)
        return { success: false, error: message }
      }

      // Retryable errors get one more attempt
      if (attempt < MAX_RETRIES && isRetryableError(message)) {
        console.warn(
          `[archidekt-pw] Retryable error on attempt ${attempt + 1}, retrying: ${message}`
        )
        continue
      }

      // Non-retryable, non-auth errors or final attempt
      console.error(`[archidekt-pw] updateProxyTags failed: ${message}`)
      return { success: false, error: message }
    }
  }

  // Should not reach here, but safety net
  return { success: false, error: lastError }
}

// ---------------------------------------------------------------------------
// Deck creation
// ---------------------------------------------------------------------------

/**
 * Build the import text for a new Commander deck.
 * The commander is marked with [Commander] category.
 *
 * Format:
 *   1x Commander Name [Commander]
 *   1x Card Name 1
 *   1x Card Name 2
 */
export function buildImportText(commanderName: string, cardNames: string[]): string {
  const lines: string[] = [`1x ${commanderName} [Commander]`]
  for (const card of cardNames) {
    lines.push(`1x ${card}`)
  }
  return lines.join('\n')
}

/**
 * Create a new Commander deck in Archidekt via Playwright automation.
 *
 * Flow:
 * 1. Navigate to Archidekt's new deck page
 * 2. Set the deck name
 * 3. Set the format to Commander
 * 4. Open the Import Cards interface
 * 5. Paste the import text (commander marked as [Commander])
 * 6. Save/create the deck
 * 7. Extract and return the new deck URL
 */
export async function createDeck(
  deckName: string,
  commanderName: string,
  cardNames: string[]
): Promise<CreateDeckResult> {
  try {
    const ctx = await getContext()
    const page = await getPage(ctx)

    // 1. Navigate to new deck page
    const newDeckUrl = `${ARCHIDEKT_BASE}/decks/new`
    console.log(`[archidekt-pw] Navigating to ${newDeckUrl}`)
    await page.goto(newDeckUrl, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT })

    // Check for login redirect
    if (page.url().includes('/login') || page.url().includes('/signin')) {
      throw new Error(
        'Archidekt session expired. Please log in manually in the browser window and retry.'
      )
    }

    // 2. Set the deck name
    const nameInput = page.getByRole('textbox', { name: /deck name|name/i })
      .or(page.locator('input[placeholder*="name" i]'))
      .or(page.locator('input[name="name"]'))
    await nameInput.first().waitFor({ state: 'visible', timeout: ACTION_TIMEOUT })
    await nameInput.first().fill(deckName)
    console.log(`[archidekt-pw] Set deck name: ${deckName}`)

    // 3. Set format to Commander
    const formatSelect = page.getByRole('combobox', { name: /format/i })
      .or(page.locator('select[name="format"]'))
      .or(page.locator('[data-testid="format-select"]'))
    await formatSelect.first().waitFor({ state: 'visible', timeout: ACTION_TIMEOUT })
    await formatSelect.first().click()

    const commanderOption = page.getByRole('option', { name: /commander/i })
      .or(page.locator('text=Commander'))
    await commanderOption.first().click({ timeout: ACTION_TIMEOUT })
    console.log('[archidekt-pw] Set format to Commander')

    // 4. Navigate to Import Cards
    const importTab = page.getByRole('tab', { name: /import/i })
      .or(page.getByRole('button', { name: /import/i }))
      .or(page.locator('text=Import'))
    await importTab.first().click({ timeout: ACTION_TIMEOUT })
    console.log('[archidekt-pw] Clicked Import tab')

    // Wait for textarea
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: ACTION_TIMEOUT })

    // 5. Build and paste import text
    const importText = buildImportText(commanderName, cardNames)
    const textarea = page.locator('textarea').first()
    await textarea.fill(importText)
    console.log(`[archidekt-pw] Pasted ${cardNames.length + 1} cards (including commander)`)

    // 6. Save/create the deck
    const saveButton = page.getByRole('button', { name: /save|create|import/i })
      .or(page.locator('button:has-text("Save")'))
      .or(page.locator('button:has-text("Create")'))
    await saveButton.first().click({ timeout: ACTION_TIMEOUT })
    console.log('[archidekt-pw] Clicked save/create button')

    // Wait for navigation or save to complete
    await page.waitForTimeout(3000)

    // Check for errors
    const errorAlert = page.locator('[role="alert"]')
      .or(page.locator('.error'))
      .or(page.locator('.alert-danger'))
    const hasError = await errorAlert.first().isVisible().catch(() => false)
    if (hasError) {
      const errorText = await errorAlert.first().textContent().catch(() => 'Unknown error')
      throw new Error(`Archidekt deck creation failed: ${errorText}`)
    }

    // 7. Extract the new deck URL
    // After creation, Archidekt typically redirects to the new deck page
    const currentUrl = page.url()
    const deckUrlMatch = currentUrl.match(/archidekt\.com\/decks\/(\d+)/)
    if (deckUrlMatch) {
      const deckUrl = `${ARCHIDEKT_BASE}/decks/${deckUrlMatch[1]}`
      console.log(`[archidekt-pw] Deck created: ${deckUrl}`)
      return { success: true, url: deckUrl }
    }

    // If URL didn't change to a deck page, try to find a link to the new deck
    const deckLink = page.locator('a[href*="/decks/"]').first()
    const href = await deckLink.getAttribute('href').catch(() => null)
    if (href) {
      const fullUrl = href.startsWith('http') ? href : `${ARCHIDEKT_BASE}${href}`
      console.log(`[archidekt-pw] Deck created (from link): ${fullUrl}`)
      return { success: true, url: fullUrl }
    }

    // Deck was likely created but we couldn't extract the URL
    console.warn('[archidekt-pw] Deck may have been created but URL could not be extracted')
    return {
      success: true,
      url: currentUrl !== newDeckUrl ? currentUrl : undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[archidekt-pw] createDeck failed: ${message}`)
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Deck reading via Playwright
// ---------------------------------------------------------------------------

/**
 * Structured card data parsed from the Import Cards textarea.
 * Matches the shape of the `deck_cards` table for easy comparison/import.
 */
export interface DeckCardData {
  cardName: string
  quantity: number
  categories: string[]
  tags: string[]
  setCode?: string
}

export interface ReadDeckResult {
  success: boolean
  cards?: DeckCardData[]
  error?: string
}

/**
 * Regex for parsing a single line from the Archidekt Import Cards format.
 *
 * Format examples:
 *   1x Sol Ring (cmm) [Ramp,Mana Rocks] ^Proxy,#e158ff^
 *   2x Lightning Bolt (m21) [Removal]
 *   1x Forest
 *
 * Capture groups:
 *   1: quantity (e.g. "1")
 *   2: card name (e.g. "Sol Ring")
 *   3: set code (optional, e.g. "cmm")
 *   4: categories (optional, e.g. "Ramp,Mana Rocks")
 *   5: remainder — tags and other trailing content
 */
const IMPORT_LINE_REGEX = /^(\d+)x\s+(.+?)(?:\s+\(([^)]+)\))(?:\s+\[([^\]]+)\])?\s*(.*)$/

/**
 * Regex for lines without a set code — handles bare cards and cards with categories only.
 * Used as fallback when the primary regex (which requires set code) doesn't match.
 */
const IMPORT_LINE_NO_SET_REGEX = /^(\d+)x\s+(.+?)(?:\s+\[([^\]]+)\])?\s*(\^.*)?$/

/**
 * Regex for extracting individual tags from the trailing portion of a line.
 * Tags are formatted as ^TagName,#hexcolour^ or just ^TagName^.
 */
const TAG_REGEX = /\^([^^]+)\^/g

/**
 * Parse a single line from the Import Cards textarea into structured data.
 * Returns null for lines that don't match the expected format (empty lines, comments).
 */
export function parseImportLine(line: string): DeckCardData | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Try primary regex (has set code)
  let match = trimmed.match(IMPORT_LINE_REGEX)
  if (match) {
    const [, quantityStr, cardName, setCode, categoriesStr, remainder] = match

    const quantity = parseInt(quantityStr, 10)
    if (isNaN(quantity) || quantity <= 0) return null

    const categories = categoriesStr
      ? categoriesStr.split(',').map(c => c.trim()).filter(Boolean)
      : []

    const tags: string[] = []
    if (remainder) {
      let tagMatch: RegExpExecArray | null
      const tagRegex = new RegExp(TAG_REGEX.source, 'g')
      while ((tagMatch = tagRegex.exec(remainder)) !== null) {
        tags.push(tagMatch[1])
      }
    }

    return {
      cardName: cardName.trim(),
      quantity,
      categories,
      tags,
      setCode,
    }
  }

  // Fallback regex (no set code)
  match = trimmed.match(IMPORT_LINE_NO_SET_REGEX)
  if (match) {
    const [, quantityStr, cardName, categoriesStr, remainder] = match

    const quantity = parseInt(quantityStr, 10)
    if (isNaN(quantity) || quantity <= 0) return null

    const categories = categoriesStr
      ? categoriesStr.split(',').map(c => c.trim()).filter(Boolean)
      : []

    const tags: string[] = []
    if (remainder) {
      let tagMatch: RegExpExecArray | null
      const tagRegex = new RegExp(TAG_REGEX.source, 'g')
      while ((tagMatch = tagRegex.exec(remainder)) !== null) {
        tags.push(tagMatch[1])
      }
    }

    return {
      cardName: cardName.trim(),
      quantity,
      categories,
      tags,
    }
  }

  return null
}

/**
 * Read a deck's full card list via Playwright by navigating to the Import Cards page
 * and parsing the textarea content.
 *
 * This is an alternative to the Archidekt API for reading deck data. It is useful
 * when the API does not return certain fields (e.g., custom tags) or when you need
 * to verify what is actually displayed in the Import interface.
 *
 * **Retry logic:** Transient errors (timeouts, network failures) are retried once.
 * Authentication errors fail immediately.
 *
 * @param deckId - The Archidekt deck ID
 * @returns Structured card data matching the `deck_cards` table shape
 */
export async function readDeckViaPlaywright(deckId: number): Promise<ReadDeckResult> {
  let lastError = ''

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const page = await navigateToImportCards(deckId)
      const text = await readImportText(page)

      const lines = text.split('\n')
      const cards: DeckCardData[] = []

      for (const line of lines) {
        const parsed = parseImportLine(line)
        if (parsed) {
          cards.push(parsed)
        }
      }

      console.log(`[archidekt-pw] readDeckViaPlaywright: parsed ${cards.length} cards from deck ${deckId}`)
      return { success: true, cards }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      lastError = message

      // Auth errors fail immediately
      if (isAuthError(message)) {
        console.error(`[archidekt-pw] Auth error in readDeckViaPlaywright — not retrying: ${message}`)
        return { success: false, error: message }
      }

      // Retryable errors get one more attempt
      if (attempt < MAX_RETRIES && isRetryableError(message)) {
        console.warn(
          `[archidekt-pw] Retryable error in readDeckViaPlaywright attempt ${attempt + 1}, retrying: ${message}`
        )
        continue
      }

      console.error(`[archidekt-pw] readDeckViaPlaywright failed: ${message}`)
      return { success: false, error: message }
    }
  }

  return { success: false, error: lastError }
}
