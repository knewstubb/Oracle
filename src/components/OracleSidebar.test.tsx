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

describe('OracleSidebar (side panel with input at the bottom)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    isOpen = false
  })

  it('renders nothing (no panel, no input, no footer content) when collapsed', () => {
    renderChat()
    expect(screen.queryByTestId('oracle-conversation')).toBeNull()
    expect(screen.queryByTestId('oracle-input-row')).toBeNull()
    expect(screen.getByTestId('app-footer')).toBeEmptyDOMElement()
  })

  it('puts the message input at the bottom of the panel, never in the footer', () => {
    isOpen = true
    renderChat()
    const panel = screen.getByTestId('oracle-conversation')
    const input = screen.getByTestId('oracle-input-row')
    expect(panel).toContainElement(input)
    expect(panel.lastElementChild).toBe(input)
    expect(screen.getByTestId('app-footer')).not.toContainElement(input)
  })

  it('sends a message typed in the panel', () => {
    isOpen = true
    renderChat()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByLabelText('Send message'))
    expect(sendMessage).toHaveBeenCalledWith('hello')
  })

  it('shows the panel beside the page (not in the footer) with a 70% black background when open', () => {
    isOpen = true
    renderChat()
    const panel = screen.getByTestId('oracle-conversation')
    // Same row as the page content, so the page narrows to make room.
    const row = screen.getByTestId('page').closest('main')!.parentElement!
    expect(row).toContainElement(panel)
    // The footer is a separate full-width bar beneath the row, so the panel stops above it.
    expect(screen.getByTestId('app-footer')).not.toContainElement(panel)
    expect(row.contains(screen.getByTestId('app-footer'))).toBe(false)
    expect(panel.className).toContain('bg-[rgba(0,0,0,0.6)]')
    fireEvent.click(screen.getByLabelText('Close Oracle'))
    expect(close).toHaveBeenCalled()
  })
})
