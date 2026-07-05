/**
 * Tests for CollectionImportButton component.
 *
 * Validates the chunked CSV import UI:
 * - Renders the import button in idle state
 * - Shows progress during import
 * - Shows success/error states
 * - Handles file selection and triggers chunkedImport
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CollectionImportButton } from './CollectionImportButton'

// Mock the chunked-import-client module
vi.mock('@/lib/chunked-import-client', () => ({
  chunkedImport: vi.fn(),
}))

import { chunkedImport } from '@/lib/chunked-import-client'
const mockChunkedImport = vi.mocked(chunkedImport)

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CollectionImportButton />
    </QueryClientProvider>
  )
}

function createFile(content: string, name = 'collection.csv') {
  return new File([content], name, { type: 'text/csv' })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionImportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Import CSV button in idle state', () => {
    renderWithProviders()

    expect(screen.getByText('Import CSV')).toBeInTheDocument()
  })

  it('has a hidden file input that accepts CSV files', () => {
    renderWithProviders()

    const fileInput = screen.getByLabelText('Select CSV file for import')
    expect(fileInput).toHaveAttribute('accept', '.csv,text/csv')
    expect(fileInput).toHaveClass('hidden')
  })

  it('triggers chunkedImport when a file is selected', async () => {
    mockChunkedImport.mockResolvedValue({
      totalRows: 10,
      totalImported: 10,
      totalErrored: 0,
      chunksTotal: 1,
      chunksSucceeded: 1,
      chunksFailed: 0,
      chunkResults: [],
      durationMs: 100,
    })

    renderWithProviders()

    const csvContent = 'Quantity,Name,Finish\n1,Sol Ring,Normal'
    const file = createFile(csvContent)

    const fileInput = screen.getByLabelText('Select CSV file for import')
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(mockChunkedImport).toHaveBeenCalledTimes(1)
    })

    // Check the call was made with CSV content
    const callArgs = mockChunkedImport.mock.calls[0][0]
    expect(callArgs.csvContent).toBe(csvContent)
    expect(callArgs.onProgress).toBeDefined()
    expect(callArgs.signal).toBeDefined()
  })

  it('shows success state after import completes', async () => {
    mockChunkedImport.mockResolvedValue({
      totalRows: 500,
      totalImported: 500,
      totalErrored: 0,
      chunksTotal: 1,
      chunksSucceeded: 1,
      chunksFailed: 0,
      chunkResults: [],
      durationMs: 200,
    })

    renderWithProviders()

    const file = createFile('Quantity,Name,Finish\n1,Sol Ring,Normal')
    const fileInput = screen.getByLabelText('Select CSV file for import')

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(screen.getByText('500 rows imported')).toBeInTheDocument()
    })
  })

  it('shows error state when import fails', async () => {
    mockChunkedImport.mockRejectedValue(new Error('CSV is empty — no header row found'))

    renderWithProviders()

    const file = createFile('')
    const fileInput = screen.getByLabelText('Select CSV file for import')

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(screen.getByText('CSV is empty — no header row found')).toBeInTheDocument()
    })
  })

  it('shows partial success when some chunks fail', async () => {
    mockChunkedImport.mockResolvedValue({
      totalRows: 1000,
      totalImported: 500,
      totalErrored: 500,
      chunksTotal: 2,
      chunksSucceeded: 1,
      chunksFailed: 1,
      chunkResults: [],
      durationMs: 300,
    })

    renderWithProviders()

    const file = createFile('Quantity,Name,Finish\n1,Sol Ring,Normal')
    const fileInput = screen.getByLabelText('Select CSV file for import')

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(screen.getByText(/500 rows imported/)).toBeInTheDocument()
      expect(screen.getByText(/1 chunk failed/)).toBeInTheDocument()
    })
  })

  it('returns to idle state when dismiss button is clicked after success', async () => {
    mockChunkedImport.mockResolvedValue({
      totalRows: 10,
      totalImported: 10,
      totalErrored: 0,
      chunksTotal: 1,
      chunksSucceeded: 1,
      chunksFailed: 0,
      chunkResults: [],
      durationMs: 50,
    })

    renderWithProviders()

    const file = createFile('Quantity,Name,Finish\n1,Sol Ring,Normal')
    const fileInput = screen.getByLabelText('Select CSV file for import')

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(screen.getByText('10 rows imported')).toBeInTheDocument()
    })

    // Click dismiss
    fireEvent.click(screen.getByLabelText('Dismiss'))

    await waitFor(() => {
      expect(screen.getByText('Import CSV')).toBeInTheDocument()
    })
  })
})
