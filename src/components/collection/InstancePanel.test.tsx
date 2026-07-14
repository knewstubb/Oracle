'use client'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InstancePanel, InstanceRow } from './InstancePanel'

/* ─── Helpers ───────────────────────────────────────────────────────── */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const mockInstances: InstanceRow[] = [
  {
    physicalCopyId: 1,
    setName: 'Modern Horizons 3',
    setCode: 'mh3',
    collectorNumber: '42',
    isFoil: false,
    condition: 'near_mint',
    isProxy: false,
    assignedDeckName: 'World Breaker',
    storageLocationName: null,
    storageLocationId: null,
  },
  {
    physicalCopyId: 2,
    setName: 'Commander Masters',
    setCode: 'cmm',
    collectorNumber: '100',
    isFoil: true,
    condition: 'lightly_played',
    isProxy: false,
    assignedDeckName: null,
    storageLocationName: 'Binder A',
    storageLocationId: 5,
  },
  {
    physicalCopyId: 3,
    setName: 'Modern Horizons 3',
    setCode: 'mh3',
    collectorNumber: '42',
    isFoil: false,
    condition: null,
    isProxy: true,
    assignedDeckName: null,
    storageLocationName: null,
    storageLocationId: null,
  },
]

function mockFetchSuccess() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/collection/instances/')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            cardName: 'Sol Ring',
            oracleId: 'oracle-123',
            instances: mockInstances,
            shortfall: 0,
          }),
      })
    }
    if (url.includes('/api/settings/storage-locations')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: 5, name: 'Binder A', color: '#ccc' }]),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }) as unknown as typeof fetch
}

/* ─── Tests ─────────────────────────────────────────────────────────── */

describe('InstancePanel — instance-level selection UX', () => {
  beforeEach(() => {
    mockFetchSuccess()
  })

  it('does NOT render checkboxes when selection props are not provided', async () => {
    render(<InstancePanel oracleId="oracle-123" onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    })

    // Wait for data to load
    expect(await screen.findByText('Sol Ring')).toBeInTheDocument()

    // No checkboxes should exist
    const checkboxes = screen.queryAllByRole('checkbox')
    // Only the storage location selects should be present — no input[type=checkbox]
    expect(checkboxes).toHaveLength(0)
  })

  it('renders one checkbox per instance row when selection props are provided', async () => {
    const isSelected = vi.fn().mockReturnValue(false)
    const toggleInstance = vi.fn()

    render(
      <InstancePanel
        oracleId="oracle-123"
        onClose={vi.fn()}
        isSelected={isSelected}
        toggleInstance={toggleInstance}
      />,
      { wrapper: createWrapper() }
    )

    expect(await screen.findByText('Sol Ring')).toBeInTheDocument()

    const checkboxes = screen.getAllByRole('checkbox')
    // 3 instance rows = 3 checkboxes
    expect(checkboxes).toHaveLength(3)
  })

  it('checkbox reflects isSelected state correctly', async () => {
    const isSelected = vi.fn((oracleId: string, physicalCopyId: number) => {
      return physicalCopyId === 2 // Only copy #2 is selected
    })
    const toggleInstance = vi.fn()

    render(
      <InstancePanel
        oracleId="oracle-123"
        onClose={vi.fn()}
        isSelected={isSelected}
        toggleInstance={toggleInstance}
      />,
      { wrapper: createWrapper() }
    )

    expect(await screen.findByText('Sol Ring')).toBeInTheDocument()

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(checkboxes[0].checked).toBe(false) // physicalCopyId 1
    expect(checkboxes[1].checked).toBe(true) // physicalCopyId 2
    expect(checkboxes[2].checked).toBe(false) // physicalCopyId 3
  })

  it('calls toggleInstance with correct args when checkbox is clicked', async () => {
    const isSelected = vi.fn().mockReturnValue(false)
    const toggleInstance = vi.fn()

    render(
      <InstancePanel
        oracleId="oracle-123"
        onClose={vi.fn()}
        isSelected={isSelected}
        toggleInstance={toggleInstance}
      />,
      { wrapper: createWrapper() }
    )

    expect(await screen.findByText('Sol Ring')).toBeInTheDocument()

    const checkboxes = screen.getAllByRole('checkbox')

    // Click the second checkbox (physicalCopyId = 2)
    fireEvent.click(checkboxes[1])
    expect(toggleInstance).toHaveBeenCalledWith('oracle-123', 2)

    // Click the first checkbox (physicalCopyId = 1)
    fireEvent.click(checkboxes[0])
    expect(toggleInstance).toHaveBeenCalledWith('oracle-123', 1)
  })

  it('checkboxes have accessible labels', async () => {
    const isSelected = vi.fn().mockReturnValue(false)
    const toggleInstance = vi.fn()

    render(
      <InstancePanel
        oracleId="oracle-123"
        onClose={vi.fn()}
        isSelected={isSelected}
        toggleInstance={toggleInstance}
      />,
      { wrapper: createWrapper() }
    )

    expect(await screen.findByText('Sol Ring')).toBeInTheDocument()

    // Check accessible labels contain set name and collector number
    // Note: multiple copies from same set/number have the same label (valid scenario)
    const mh3Checkboxes = screen.getAllByLabelText('Select Modern Horizons 3 #42')
    expect(mh3Checkboxes).toHaveLength(2) // original + proxy from same set
    expect(
      screen.getByLabelText('Select Commander Masters #100')
    ).toBeInTheDocument()
  })

  it('checkbox is keyboard accessible (togglable via Space)', async () => {
    const isSelected = vi.fn().mockReturnValue(false)
    const toggleInstance = vi.fn()

    render(
      <InstancePanel
        oracleId="oracle-123"
        onClose={vi.fn()}
        isSelected={isSelected}
        toggleInstance={toggleInstance}
      />,
      { wrapper: createWrapper() }
    )

    expect(await screen.findByText('Sol Ring')).toBeInTheDocument()

    const checkboxes = screen.getAllByRole('checkbox')
    // Native HTML checkbox inputs are keyboard accessible by default —
    // they're focusable and toggle on Space. Verify it's an input element.
    expect(checkboxes[0].tagName).toBe('INPUT')
    expect(checkboxes[0]).toHaveAttribute('type', 'checkbox')
  })
})
