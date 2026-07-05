import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'

// Mock next/navigation
const mockPathname = vi.fn(() => '/')
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}))

// Mock next-themes
const mockSetTheme = vi.fn()
vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'light',
    setTheme: mockSetTheme,
  }),
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Sidebar />
    </QueryClientProvider>
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    mockPathname.mockReturnValue('/')
  })

  it('renders all 5 nav items', () => {
    renderSidebar()
    expect(screen.getByText('Decks')).toBeInTheDocument()
    expect(screen.getByText('Shared Cards')).toBeInTheDocument()
    expect(screen.getByText('Collection')).toBeInTheDocument()
    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByText('Brew Deck')).toBeInTheDocument()
  })

  it('highlights the active route (Decks at /)', () => {
    mockPathname.mockReturnValue('/')
    renderSidebar()
    const decksLink = screen.getByText('Decks').closest('a')
    expect(decksLink).toHaveAttribute('aria-current', 'page')
  })

  it('highlights Shared Cards when on /shared-cards', () => {
    mockPathname.mockReturnValue('/shared-cards')
    renderSidebar()
    const sharedLink = screen.getByText('Shared Cards').closest('a')
    expect(sharedLink).toHaveAttribute('aria-current', 'page')

    const decksLink = screen.getByText('Decks').closest('a')
    expect(decksLink).not.toHaveAttribute('aria-current')
  })

  it('collapses to icons only when collapse button is clicked', () => {
    renderSidebar()
    // Initially expanded — labels visible
    expect(screen.getByText('Decks')).toBeInTheDocument()

    // Click collapse button
    const collapseBtn = screen.getByLabelText('Collapse sidebar')
    fireEvent.click(collapseBtn)

    // After collapse, the sidebar should have data-collapsed="true"
    const sidebar = document.querySelector('aside')
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')

    // localStorage should be updated
    expect(localStorageMock.setItem).toHaveBeenCalledWith('sidebar-collapsed', 'true')
  })

  it('persists collapse state in localStorage', () => {
    localStorageMock.getItem.mockReturnValue('true')
    renderSidebar()
    const sidebar = document.querySelector('aside')
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')
  })

  it('Cmd+K dispatches open-search event', () => {
    renderSidebar()
    const handler = vi.fn()
    window.addEventListener('open-search', handler)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(handler).toHaveBeenCalledTimes(1)

    window.removeEventListener('open-search', handler)
  })

  it('Ctrl+K dispatches open-search event', () => {
    renderSidebar()
    const handler = vi.fn()
    window.addEventListener('open-search', handler)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)

    window.removeEventListener('open-search', handler)
  })

  it('has accessible navigation landmark', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav).toBeInTheDocument()
  })
})
