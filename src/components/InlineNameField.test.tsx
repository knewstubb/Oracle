import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InlineNameField } from './InlineNameField'

const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Rename Korvold' }))
  return screen.getByRole('textbox', { name: 'Deck name' }) as HTMLInputElement
}

describe('InlineNameField', () => {
  beforeEach(() => {
    toast.error.mockClear()
    toast.info.mockClear()
  })

  it('opens on click with the whole name selected', async () => {
    const user = userEvent.setup()
    render(<InlineNameField name="Korvold" onSave={vi.fn()} />)
    const input = await open(user)
    expect(input.value).toBe('Korvold')
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(7)
  })

  it('saves the trimmed name on Enter and shows no message', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue({ ok: true })
    render(<InlineNameField name="Korvold" onSave={onSave} />)
    await open(user)
    await user.keyboard('  Prosper  {Enter}')
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Prosper'))
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('saves when the owner clicks away', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue({ ok: true })
    render(<><InlineNameField name="Korvold" onSave={onSave} /><p>elsewhere</p></>)
    await open(user)
    await user.keyboard('Atraxa')
    await user.click(screen.getByText('elsewhere'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Atraxa'))
  })

  it('Escape restores the old name without saving', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<InlineNameField name="Korvold" onSave={onSave} />)
    await open(user)
    await user.keyboard('Prosper{Escape}')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('closes quietly when the name is unchanged', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<InlineNameField name="Korvold" onSave={onSave} />)
    await open(user)
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses an empty name with a message and keeps the old name', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<InlineNameField name="Korvold" onSave={onSave} />)
    await open(user)
    await user.keyboard('{Backspace}{Enter}')
    expect(toast.error).toHaveBeenCalledWith('A deck needs a name.', undefined)
    expect(onSave).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    expect(screen.getByRole('button', { name: 'Rename Korvold' })).toBeInTheDocument()
  })

  it('says so when the name is already used', async () => {
    const user = userEvent.setup()
    render(<InlineNameField name="Korvold" onSave={vi.fn().mockResolvedValue({ ok: false, error: 'name_taken' })} />)
    await open(user)
    await user.keyboard('prosper{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('You already have a deck with that name.', undefined))
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  })

  it('a failed save restores the old name and offers Try again with what was typed', async () => {
    const user = userEvent.setup()
    render(<InlineNameField name="Korvold" onSave={vi.fn().mockResolvedValue({ ok: false, error: 'save_failed' })} />)
    await open(user)
    await user.keyboard('Prosper{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    const [message, options] = toast.error.mock.calls[0]
    expect(message).toBe("Couldn't rename Korvold. It still has its old name.")
    expect(options.action.label).toBe('Try again')
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
    options.action.onClick()
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Prosper'))
  })

  it('cuts a paste at 100 characters and says why', async () => {
    const user = userEvent.setup()
    render(<InlineNameField name="Korvold" onSave={vi.fn()} />)
    const input = await open(user)
    await user.paste('x'.repeat(130))
    expect(input.value).toHaveLength(100)
    expect(toast.info).toHaveBeenCalledWith('Names can be up to 100 characters.', { id: 'deck-name-too-long' })
  })

  it('ignores Enter while an input method is still composing', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue({ ok: true })
    render(<InlineNameField name="Korvold" onSave={onSave} />)
    const input = await open(user)
    await user.keyboard('x')
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onSave).not.toHaveBeenCalled()
  })
})
