import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DraftBanner } from './DraftBanner'

describe('DraftBanner', () => {
  it('renders the draft status text', () => {
    render(<DraftBanner deckId={42} onContinue={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('This deck is a draft')).toBeInTheDocument()
  })

  it('renders Continue brewing and Delete draft buttons', () => {
    render(<DraftBanner deckId={42} onContinue={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: /continue brewing/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete draft/i })).toBeInTheDocument()
  })

  it('calls onContinue with deckId when Continue brewing is clicked', () => {
    const onContinue = vi.fn()
    render(<DraftBanner deckId={7} onContinue={onContinue} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /continue brewing/i }))
    expect(onContinue).toHaveBeenCalledWith(7)
  })

  it('calls onDelete with deckId when Delete draft is clicked', () => {
    const onDelete = vi.fn()
    render(<DraftBanner deckId={13} onContinue={vi.fn()} onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: /delete draft/i }))
    expect(onDelete).toHaveBeenCalledWith(13)
  })

  it('has accessible role and label', () => {
    render(<DraftBanner deckId={1} onContinue={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('status', { name: /draft deck banner/i })).toBeInTheDocument()
  })
})
