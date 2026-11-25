import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FolderChip } from './FolderChip'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const dt = (deckId: string, folder: string) => {
  const data: Record<string, string> = { 'application/x-deck-id': deckId, 'application/x-deck-folder': folder, 'text/plain': 'Korvold' }
  return { types: Object.keys(data), getData: (k: string) => data[k] ?? '', dropEffect: '' }
}
const renderChip = () => {
  const onDropTarget = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FolderChip id={5} name="Commanders" count={2} onDropTarget={onDropTarget} />
    </QueryClientProvider>
  )
  return { chip: screen.getByRole('button'), onDropTarget }
}

describe('FolderChip drop (brief: dragging onto a folder still files the deck)', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    Object.values(toast).forEach((f) => f.mockClear())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('files the deck in the folder', async () => {
    const { chip } = renderChip()
    fireEvent.drop(chip, { dataTransfer: dt('12', '') })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/decks/12/folder')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ folderId: 5 })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Moved to Commanders'))
  })
  it('says so when the deck is already in that folder, and saves nothing', () => {
    const { chip } = renderChip()
    fireEvent.drop(chip, { dataTransfer: dt('12', '5') })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith('Korvold is already in Commanders.')
  })
  it('ignores a drag that is not a deck', () => {
    const { chip } = renderChip()
    fireEvent.drop(chip, { dataTransfer: { types: ['text/plain'], getData: () => '' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('shows "Drop to file here" while a deck is over it and tells the grid when it leaves', () => {
    const { chip, onDropTarget } = renderChip()
    fireEvent.dragOver(chip, { dataTransfer: dt('12', '') })
    expect(screen.getByText('Drop to file here')).toBeTruthy()
    expect(onDropTarget).toHaveBeenCalledWith(true)
    fireEvent.dragLeave(chip, { dataTransfer: dt('12', '') })
    expect(screen.queryByText('Drop to file here')).toBeNull()
    expect(onDropTarget).toHaveBeenLastCalledWith(false)
  })
  it('a failed filing shows the error', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) })
    const { chip } = renderChip()
    fireEvent.drop(chip, { dataTransfer: dt('12', '') })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'))
  })
})
