import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OracleSidebar } from './OracleSidebar'
import { MainContentWrapper } from './MainContentWrapper'

vi.mock('@/contexts/PageHeaderContext', () => ({ usePageHeaderContext: () => ({ config: null }) }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/SessionHistoryPanel', () => ({ SessionHistoryPanel: () => null }))
vi.mock('@/components/CardHoverPreview', () => ({
  cardOwnershipData: new Map(),
  usePreloadCardImages: () => {},
}))

const open = vi.fn()
const close = vi.fn()
const sendMessage = vi.fn()
let isOpen = false

vi.mock('@/contexts/OracleContext', () => ({
  useOracle: () => ({
    isOpen,
    messages: [],
    activeContext: { type: 'general' },
    activeSession: null,
    isStreaming: false,
    isLoadingHistory: false,
    isHistoryPanelOpen: false,
    close,
    open,
    sendMessage,
    clearMessages: vi.fn(),
    openHistoryPanel: vi.fn(),
  }),
}))

function renderChat() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MainContentWrapper sidebar={<OracleSidebar />}>
        <div data-testid="page">page content</div>
      </MainContentWrapper>
    </QueryClientProvider>
  )
}

describe('OracleSidebar (chat docked in the footer)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    isOpen = false
  })

  it('puts the chat input inside the single app footer, with no panel when collapsed', () => {
    renderChat()
    const footer = screen.getByTestId('app-footer')
    expect(footer.tagName).toBe('FOOTER')
    expect(footer).toContainElement(screen.getByTestId('oracle-input-row'))
    expect(footer).toContainElement(screen.getByLabelText('Send message'))
    expect(document.querySelectorAll('footer')).toHaveLength(1)
    expect(screen.queryByTestId('oracle-conversation')).toBeNull()
  })

  it('opens the conversation when the input is focused', () => {
    renderChat()
    fireEvent.focus(screen.getByRole('textbox'))
    expect(open).toHaveBeenCalled()
  })

  it('opens and sends when a message is submitted while collapsed', () => {
    renderChat()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByLabelText('Send message'))
    expect(open).toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledWith('hello')
  })

  it('shows the panel beside the page (not in the footer) with a 50% opaque background when open', () => {
    isOpen = true
    renderChat()
    const panel = screen.getByTestId('oracle-conversation')
    // Same row as the page content, so the page narrows to make room.
    const row = screen.getByTestId('page').closest('main')!.parentElement!
    expect(row).toContainElement(panel)
    // The footer is a separate full-width bar beneath the row, so the panel stops above it.
    expect(screen.getByTestId('app-footer')).not.toContainElement(panel)
    expect(row.contains(screen.getByTestId('app-footer'))).toBe(false)
    expect(panel.className).toContain('bg-[rgba(24,24,27,0.5)]')
    fireEvent.click(screen.getByLabelText('Close Oracle'))
    expect(close).toHaveBeenCalled()
  })
})
