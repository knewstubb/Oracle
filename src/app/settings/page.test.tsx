import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/contexts/PageHeaderContext', () => ({ usePageHeader: () => {} }))
vi.mock('@/components/CardDataSection', () => ({ CardDataSection: () => <div>Card data</div> }))

import SettingsPage from './page'

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsPage />
    </QueryClientProvider>
  )
}

describe('Settings: Clear All Data', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows Clear All Data when the app runs on the owner\'s own computer (not production)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    renderPage()
    expect(screen.getByRole('button', { name: 'Clear All Data' })).toBeInTheDocument()
    expect(screen.getByText('These actions are destructive and cannot be undone.')).toBeInTheDocument()
  })

  it('hides Clear All Data on the hosted site (production); the Component Library link stays', () => {
    vi.stubEnv('NODE_ENV', 'production')
    renderPage()
    expect(screen.queryByRole('button', { name: 'Clear All Data' })).not.toBeInTheDocument()
    expect(screen.queryByText('These actions are destructive and cannot be undone.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Component Library' })).toBeInTheDocument()
  })
})
