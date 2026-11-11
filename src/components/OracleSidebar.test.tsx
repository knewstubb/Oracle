import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OracleSidebar } from './OracleSidebar'

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
      <OracleSidebar />
    </QueryClientProvider>
  )
}

describe('OracleSidebar (chat docked in the footer)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    isOpen = false
  })

  it('shows only the input row in the footer when collapsed', () => {
    renderChat()
    expect(screen.getByTestId('oracle-footer').tagName).toBe('FOOTER')
    expect(screen.getByLabelText('Send message')).toBeInTheDocument()
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

  it('expands the conversation above the input with a 50% opaque background when open', () => {
    isOpen = true
    renderChat()
    const panel = screen.getByTestId('oracle-conversation')
    expect(panel.className).toContain('bottom-full')
    expect(panel.className).toContain('bg-[rgba(24,24,27,0.5)]')
    expect(screen.getByTestId('oracle-footer').className).toContain('bg-[rgba(24,24,27,0.5)]')
    fireEvent.click(screen.getByLabelText('Close Oracle'))
    expect(close).toHaveBeenCalled()
  })
})
