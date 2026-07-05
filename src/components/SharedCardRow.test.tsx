import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SharedCardRow, type SharedCardData } from './SharedCardRow'

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { blurDataURL, unoptimized, priority, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />
  },
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const baseCard: SharedCardData = {
  card_name: 'Sol Ring',
  set_code: 'c21',
  scryfall_id: 'abc12345-6789-0000-0000-000000000000',
  deck_count: 3,
  owned_this_printing: 2,
  owned_total: 2,
  needing_proxies: true,
  decks: [
    { id: 1, name: 'Muldrotha', is_proxy: false },
    { id: 2, name: 'Atraxa', is_proxy: true },
    { id: 3, name: 'Korvold', is_proxy: true },
  ],
}

describe('SharedCardRow', () => {
  it('renders card name in bold', () => {
    render(<SharedCardRow card={baseCard} />, { wrapper: createWrapper() })
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
  })

  it('renders card image with 48px dimensions', () => {
    render(<SharedCardRow card={baseCard} />, { wrapper: createWrapper() })
    const img = screen.getByRole('img', { name: 'Sol Ring (C21) card art' })
    expect(img).toHaveAttribute('width', '48')
    expect(img).toHaveAttribute('height', '48')
  })

  it('renders deck pill badges for each deck', () => {
    render(<SharedCardRow card={baseCard} />, { wrapper: createWrapper() })
    expect(screen.getByText('Muldrotha')).toBeInTheDocument()
    expect(screen.getByText('Atraxa')).toBeInTheDocument()
    expect(screen.getByText('Korvold')).toBeInTheDocument()
  })

  it('shows owned copies count', () => {
    render(<SharedCardRow card={baseCard} />, { wrapper: createWrapper() })
    expect(screen.getByText('Owned: 2')).toBeInTheDocument()
  })

  it('shows amber warning icon when needing proxies', () => {
    render(<SharedCardRow card={baseCard} />, { wrapper: createWrapper() })
    const warning = screen.getByLabelText(/needs proxies/i)
    expect(warning).toBeInTheDocument()
  })

  it('does not show warning when not needing proxies', () => {
    const card = { ...baseCard, needing_proxies: false, owned_this_printing: 5, owned_total: 5 }
    render(<SharedCardRow card={card} />, { wrapper: createWrapper() })
    expect(screen.queryByLabelText(/needs proxies/i)).not.toBeInTheDocument()
  })

  it('has aria-expanded=false by default', () => {
    render(<SharedCardRow card={baseCard} />, { wrapper: createWrapper() })
    const button = screen.getByRole('button', { name: /Sol Ring/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands on click to show ProxyAllocationPanel', () => {
    render(<SharedCardRow card={baseCard} />, { wrapper: createWrapper() })
    const button = screen.getByRole('button', { name: /Sol Ring/i })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    // ProxyAllocationPanel renders the "You own N copies" heading
    expect(screen.getByText(/You own 2 copies/)).toBeInTheDocument()
  })

  it('collapses on second click', () => {
    render(<SharedCardRow card={baseCard} />, { wrapper: createWrapper() })
    const button = screen.getByRole('button', { name: /Sol Ring/i })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/You own 2 copies/)).not.toBeInTheDocument()
  })

  it('renders as a listitem', () => {
    render(<SharedCardRow card={baseCard} />, { wrapper: createWrapper() })
    expect(screen.getByRole('listitem')).toBeInTheDocument()
  })
})
