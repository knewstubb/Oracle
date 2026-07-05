import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock playwright before importing the module
vi.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: vi.fn(),
  },
}))

import type { ProxyTagChange } from './archidekt-playwright'
import { chromium } from 'playwright'

const sampleImportText = `1x Sol Ring (c21) [Ramp]
1x Ashnod's Altar (scd) [Ramp,Sac Outlet]
1x Blood Crypt (rnc)
1x Muldrotha, the Gravetide (dom) [Commander]
1x Deadly Dispute (tdc) [Draw,Sac Outlet,Ramp]  ^Proxy,#e158ff^`

const PROXY_TAG = '^Proxy,#e158ff^'

// Helpers to build mock page/context
function createMockPage(textareaValue: string, opts?: { loginRedirect?: boolean; gotoError?: Error }) {
  let currentValue = textareaValue
  let saveClicked = false
  let errorVisible = false

  const mockLocator = {
    first: vi.fn().mockReturnThis(),
    waitFor: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockImplementation(async () => {
      saveClicked = true
    }),
    inputValue: vi.fn(() => Promise.resolve(currentValue)),
    fill: vi.fn((text: string) => {
      currentValue = text
      return Promise.resolve()
    }),
    isVisible: vi.fn(() => Promise.resolve(errorVisible)),
    textContent: vi.fn().mockResolvedValue(''),
    or: vi.fn().mockReturnThis(),
  }

  const deckUrl = opts?.loginRedirect
    ? 'https://archidekt.com/login'
    : 'https://archidekt.com/decks/123/edit'

  const mockPage = {
    goto: opts?.gotoError
      ? vi.fn().mockRejectedValue(opts.gotoError)
      : vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue(deckUrl),
    locator: vi.fn().mockReturnValue(mockLocator),
    getByRole: vi.fn().mockReturnValue(mockLocator),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  }

  return {
    mockPage,
    mockLocator,
    getCurrentValue: () => currentValue,
    setErrorVisible: (text: string) => {
      errorVisible = true
      mockLocator.textContent.mockResolvedValue(text)
    },
  }
}

function setupMockContext(mockPage: ReturnType<typeof createMockPage>['mockPage']) {
  const mockContext = {
    pages: vi.fn().mockReturnValue([mockPage]),
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    newPage: vi.fn().mockResolvedValue(mockPage),
  }

  vi.mocked(chromium.launchPersistentContext).mockResolvedValue(mockContext as never)
  return mockContext
}

describe('updateProxyTags', () => {
  // Re-import the module fresh for each test to reset the singleton browserContext
  let updateProxyTags: (deckId: number, changes: ProxyTagChange[]) => Promise<{ success: boolean; error?: string; changesApplied?: number }>
  let closeContext: () => Promise<void>

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset module to clear the cached browserContext singleton
    vi.resetModules()
    // Re-mock playwright after module reset
    vi.doMock('playwright', () => ({
      chromium: {
        launchPersistentContext: vi.fn(),
      },
    }))
    const mod = await import('./archidekt-playwright')
    updateProxyTags = mod.updateProxyTags
    closeContext = mod.closeContext
    // Import the fresh mock
    const pw = await import('playwright')
    // Store reference for setupMockContext
    ;(globalThis as Record<string, unknown>).__chromium = pw.chromium
  })

  function setupMock(mockPage: ReturnType<typeof createMockPage>['mockPage']) {
    const mockContext = {
      pages: vi.fn().mockReturnValue([mockPage]),
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(mockPage),
    }
    const chr = (globalThis as Record<string, unknown>).__chromium as typeof chromium
    vi.mocked(chr.launchPersistentContext).mockResolvedValue(mockContext as never)
    return mockContext
  }

  it('adds proxy tag to specified cards', async () => {
    const { mockPage, getCurrentValue } = createMockPage(sampleImportText)
    setupMock(mockPage)

    const changes: ProxyTagChange[] = [
      { cardName: 'Sol Ring', action: 'add' },
    ]

    const result = await updateProxyTags(123, changes)

    expect(result.success).toBe(true)
    expect(result.changesApplied).toBe(1)
    const finalText = getCurrentValue()
    const solRingLine = finalText.split('\n').find((l: string) => l.includes('Sol Ring'))
    expect(solRingLine).toContain(PROXY_TAG)
  })

  it('removes proxy tag from specified cards', async () => {
    const { mockPage, getCurrentValue } = createMockPage(sampleImportText)
    setupMock(mockPage)

    const changes: ProxyTagChange[] = [
      { cardName: 'Deadly Dispute', action: 'remove' },
    ]

    const result = await updateProxyTags(123, changes)

    expect(result.success).toBe(true)
    expect(result.changesApplied).toBe(1)
    const finalText = getCurrentValue()
    const ddLine = finalText.split('\n').find((l: string) => l.includes('Deadly Dispute'))
    expect(ddLine).not.toContain(PROXY_TAG)
    expect(ddLine).toContain('[Draw,Sac Outlet,Ramp]')
  })

  it('handles multiple changes in one call', async () => {
    const { mockPage, getCurrentValue } = createMockPage(sampleImportText)
    setupMock(mockPage)

    const changes: ProxyTagChange[] = [
      { cardName: 'Sol Ring', action: 'add' },
      { cardName: 'Blood Crypt', action: 'add' },
      { cardName: 'Deadly Dispute', action: 'remove' },
    ]

    const result = await updateProxyTags(123, changes)

    expect(result.success).toBe(true)
    expect(result.changesApplied).toBe(3)
    const finalText = getCurrentValue()
    expect(finalText).toContain('Sol Ring (c21) [Ramp]  ' + PROXY_TAG)
    expect(finalText).toContain('Blood Crypt (rnc)  ' + PROXY_TAG)
    const ddLine = finalText.split('\n').find((l: string) => l.includes('Deadly Dispute'))
    expect(ddLine).not.toContain(PROXY_TAG)
  })

  it('does not corrupt other tags/categories', async () => {
    const textWithTags = `1x Sol Ring (c21) [Ramp]  ^Have,#37d67a^
1x Blood Crypt (rnc)  ^Proxy,#e158ff^
1x Muldrotha, the Gravetide (dom) [Commander]`

    const { mockPage, getCurrentValue } = createMockPage(textWithTags)
    setupMock(mockPage)

    const changes: ProxyTagChange[] = [
      { cardName: 'Sol Ring', action: 'add' },
      { cardName: 'Blood Crypt', action: 'remove' },
    ]

    const result = await updateProxyTags(123, changes)

    expect(result.success).toBe(true)
    const finalText = getCurrentValue()
    // Sol Ring should have both tags
    const solLine = finalText.split('\n').find((l: string) => l.includes('Sol Ring'))
    expect(solLine).toContain('^Have,#37d67a^')
    expect(solLine).toContain(PROXY_TAG)
    // Blood Crypt should have no proxy tag
    const bcLine = finalText.split('\n').find((l: string) => l.includes('Blood Crypt'))
    expect(bcLine).not.toContain(PROXY_TAG)
    // Muldrotha untouched
    const mLine = finalText.split('\n').find((l: string) => l.includes('Muldrotha'))
    expect(mLine).toContain('[Commander]')
    expect(mLine).not.toContain(PROXY_TAG)
  })

  it('returns success with 0 changes when nothing to modify', async () => {
    const { mockPage } = createMockPage(sampleImportText)
    setupMock(mockPage)

    // Deadly Dispute already has proxy tag (add = no-op), Sol Ring doesn't (remove = no-op)
    const changes: ProxyTagChange[] = [
      { cardName: 'Deadly Dispute', action: 'add' },
      { cardName: 'Sol Ring', action: 'remove' },
    ]

    const result = await updateProxyTags(123, changes)

    expect(result.success).toBe(true)
    expect(result.changesApplied).toBe(0)
  })

  it('handles save failure gracefully', async () => {
    const { mockPage } = createMockPage(sampleImportText)
    setupMock(mockPage)

    // Override locator to return different mocks based on selector
    mockPage.locator = vi.fn().mockImplementation((selector: string) => {
      if (selector === 'textarea') {
        return {
          first: vi.fn().mockReturnThis(),
          waitFor: vi.fn().mockResolvedValue(undefined),
          click: vi.fn().mockResolvedValue(undefined),
          inputValue: vi.fn().mockResolvedValue(sampleImportText),
          fill: vi.fn().mockResolvedValue(undefined),
          isVisible: vi.fn().mockResolvedValue(false),
          textContent: vi.fn().mockResolvedValue(''),
          or: vi.fn().mockReturnThis(),
        }
      }
      // Error alert locator — visible with error text
      return {
        first: vi.fn().mockReturnThis(),
        isVisible: vi.fn().mockResolvedValue(true),
        textContent: vi.fn().mockResolvedValue('Save failed: network error'),
        or: vi.fn().mockReturnThis(),
      }
    })

    const changes: ProxyTagChange[] = [
      { cardName: 'Sol Ring', action: 'add' },
    ]

    const result = await updateProxyTags(123, changes)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Save failed')
  })

  it('handles login redirect gracefully', async () => {
    const { mockPage } = createMockPage(sampleImportText, { loginRedirect: true })
    setupMock(mockPage)

    const changes: ProxyTagChange[] = [
      { cardName: 'Sol Ring', action: 'add' },
    ]

    const result = await updateProxyTags(123, changes)

    expect(result.success).toBe(false)
    expect(result.error).toContain('session expired')
  })

  it('handles navigation timeout gracefully', async () => {
    const { mockPage } = createMockPage(sampleImportText, {
      gotoError: new Error('Timeout 30000ms exceeded'),
    })
    setupMock(mockPage)

    const changes: ProxyTagChange[] = [
      { cardName: 'Sol Ring', action: 'add' },
    ]

    const result = await updateProxyTags(123, changes)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Timeout')
  })
})
