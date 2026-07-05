import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BrewModePage from './page'
import type { BrewState } from '@/hooks/useBrewSession'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => null,
  }),
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    return <img {...rest} />
  },
}))

// Mock useBrewSession hook
const mockStartSession = vi.fn()
const mockResumeSession = vi.fn()
const mockConfirmCommander = vi.fn()
const mockSubmitConcept = vi.fn()
const mockSendMessage = vi.fn()
const mockConfirmBrief = vi.fn()
const mockEditBrief = vi.fn()
const mockRefine = vi.fn()
const mockSaveDeck = vi.fn().mockResolvedValue({ success: true })
const mockAbandonSession = vi.fn()

let mockState: BrewState = {
  phase: 'idle',
  sessionId: null,
  pathType: null,
  commander: null,
  messages: [],
  brief: null,
  skeleton: null,
  error: null,
}

vi.mock('@/hooks/useBrewSession', () => ({
  useBrewSession: () => ({
    state: mockState,
    startSession: mockStartSession,
    resumeSession: mockResumeSession,
    confirmCommander: mockConfirmCommander,
    submitConcept: mockSubmitConcept,
    sendMessage: mockSendMessage,
    confirmBrief: mockConfirmBrief,
    editBrief: mockEditBrief,
    refine: mockRefine,
    saveDeck: mockSaveDeck,
    abandonSession: mockAbandonSession,
    isStreaming: false,
    streamingText: '',
  }),
}))

// Mock CommanderSearch
vi.mock('@/components/CommanderSearch', () => ({
  CommanderSearch: ({ onSelect, onNext }: { onSelect: (c: unknown) => void; onNext: () => void }) => (
    <div data-testid="commander-search">
      <button
        onClick={() =>
          onSelect({
            name: 'Muldrotha, the Gravetide',
            manaCost: '{3}{B}{G}{U}',
            typeLine: 'Legendary Creature — Elemental Avatar',
            colorIdentity: ['B', 'G', 'U'],
            oracleText: 'test',
            owned: true,
          })
        }
      >
        Select Commander
      </button>
      <button onClick={onNext}>Next</button>
    </div>
  ),
}))

// Mock BrewPathSelector
vi.mock('@/components/BrewPathSelector', () => ({
  BrewPathSelector: ({ onSelectPath }: { onSelectPath: (p: string) => void }) => (
    <div data-testid="path-selector">
      <button onClick={() => onSelectPath('commander')}>Start with a Commander</button>
      <button onClick={() => onSelectPath('concept')}>Start with a Concept</button>
    </div>
  ),
}))

// Mock BrewConfirmationCard
vi.mock('@/components/BrewConfirmationCard', () => ({
  BrewConfirmationCard: ({ commander, onConfirm, onBack }: { commander: { name: string }; onConfirm: () => void; onBack: () => void }) => (
    <div data-testid="confirmation-card">
      <span>{commander.name}</span>
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}))

// Mock BrewBriefCard
vi.mock('@/components/BrewBriefCard', () => ({
  BrewBriefCard: ({ onConfirm, onEdit }: { onConfirm: () => void; onEdit: () => void }) => (
    <div data-testid="brief-card">
      <button onClick={onConfirm}>Confirm Brief</button>
      <button onClick={onEdit}>Edit Brief</button>
    </div>
  ),
}))

// Mock BrewSkeletonPanel
vi.mock('@/components/BrewSkeletonPanel', () => ({
  BrewSkeletonPanel: ({ onSave }: { onSave: () => void }) => (
    <div data-testid="skeleton-panel">
      <button onClick={onSave}>Save Deck</button>
    </div>
  ),
}))

// Mock BrewSaveDialog
vi.mock('@/components/BrewSaveDialog', () => ({
  BrewSaveDialog: ({ onSave, onCancel }: { onSave: (opts: unknown) => void; onCancel: () => void }) => (
    <div data-testid="save-dialog">
      <button onClick={() => onSave({ deckName: 'Test Deck', pushToArchidekt: true })}>Save</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}))

// Mock OracleChat
vi.mock('@/components/OracleChat', () => ({
  OracleChat: ({ onSendMessage, inputPlaceholder, contextPanel }: {
    onSendMessage: (text: string) => void
    inputPlaceholder?: string
    contextPanel?: React.ReactNode
  }) => (
    <div data-testid="oracle-chat">
      <div data-testid="context-panel">{contextPanel}</div>
      <input
        data-testid="chat-input"
        placeholder={inputPlaceholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSendMessage((e.target as HTMLInputElement).value)
        }}
      />
    </div>
  ),
}))

describe('BrewModePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockState = {
      phase: 'idle',
      sessionId: null,
      pathType: null,
      commander: null,
      messages: [],
      brief: null,
      skeleton: null,
      error: null,
    }

    // Default: no active session found
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve(null),
    })
  })

  it('shows path selector when phase is idle', async () => {
    render(<BrewModePage />)

    await waitFor(() => {
      expect(screen.getByTestId('path-selector')).toBeInTheDocument()
    })
  })

  it('calls startSession when path is selected', async () => {
    render(<BrewModePage />)

    await waitFor(() => {
      expect(screen.getByTestId('path-selector')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Start with a Commander'))
    expect(mockStartSession).toHaveBeenCalledWith('commander')
  })

  it('shows commander search when pathType is commander and phase is selecting', async () => {
    mockState = { ...mockState, phase: 'selecting', pathType: 'commander' }

    render(<BrewModePage />)

    await waitFor(() => {
      expect(screen.getByTestId('commander-search')).toBeInTheDocument()
    })
  })

  it('shows OracleChat in investigating phase', async () => {
    mockState = {
      ...mockState,
      phase: 'investigating',
      sessionId: 1,
      messages: [{ id: 'a-1', role: 'assistant' as const, content: 'Hello!', timestamp: Date.now() }],
    }

    render(<BrewModePage />)

    await waitFor(() => {
      expect(screen.getByTestId('oracle-chat')).toBeInTheDocument()
    })
  })

  it('shows brief card in context panel when confirming', async () => {
    mockState = {
      ...mockState,
      phase: 'confirming',
      sessionId: 1,
      messages: [{ id: 'a-1', role: 'assistant' as const, content: 'Hello!', timestamp: Date.now() }],
      brief: {
        commanderName: 'Muldrotha, the Gravetide',
        colourIdentity: ['B', 'G', 'U'],
        primaryWinCondition: 'Combo',
        secondaryWinCondition: 'Value',
        targetBracket: 3 as const,
        knownIncludes: [],
        playstyleDescription: 'Graveyard recursion',
        budgetPreference: 'collection' as const,
      },
    }

    render(<BrewModePage />)

    await waitFor(() => {
      expect(screen.getByTestId('brief-card')).toBeInTheDocument()
    })
  })

  it('shows loading spinner in context panel when generating', async () => {
    mockState = {
      ...mockState,
      phase: 'generating',
      sessionId: 1,
      messages: [{ id: 'a-1', role: 'assistant' as const, content: 'Hello!', timestamp: Date.now() }],
    }

    render(<BrewModePage />)

    await waitFor(() => {
      expect(screen.getByText('Building your deck...')).toBeInTheDocument()
    })
  })

  it('shows skeleton panel in context panel when refining', async () => {
    mockState = {
      ...mockState,
      phase: 'refining',
      sessionId: 1,
      messages: [{ id: 'a-1', role: 'assistant' as const, content: 'Hello!', timestamp: Date.now() }],
      skeleton: {
        commanderName: 'Muldrotha, the Gravetide',
        colourIdentity: ['B', 'G', 'U'],
        totalCards: 100,
        categories: [],
      },
    }

    render(<BrewModePage />)

    await waitFor(() => {
      expect(screen.getByTestId('skeleton-panel')).toBeInTheDocument()
    })
  })

  it('shows resume prompt when active session is found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 42 }),
    })

    render(<BrewModePage />)

    await waitFor(() => {
      expect(screen.getByText('You have a brew in progress')).toBeInTheDocument()
    })
  })

  it('calls resumeSession when resume is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 42 }),
    })

    render(<BrewModePage />)

    await waitFor(() => {
      expect(screen.getByText('Resume')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Resume'))
    expect(mockResumeSession).toHaveBeenCalledWith(42)
  })
})
