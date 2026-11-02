import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewCommanderSelect } from './ReviewCommanderSelect'

const cards = [
  { name: 'Lurrus of the Dream-Den', scryfallId: 's1' },
  { name: 'Sol Ring', scryfallId: 's2' },
]

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const f = vi.fn(async (url: string, init: RequestInit) => impl(url, init))
  vi.stubGlobal('fetch', f)
  return f
}

describe('ReviewCommanderSelect companion / second slots', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('companion: asks for role=companion, lists only eligible cards, and picks one', async () => {
    const f = mockFetch(() => Response.json({ eligible: ['Lurrus of the Dream-Den'] }))
    const onChange = vi.fn()
    render(<ReviewCommanderSelect slot="companion" cards={cards} value={null} onChange={onChange} />)
    expect(screen.getByText('Companion')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /Companion/ }))
    const option = await screen.findByRole('option', { name: /Lurrus of the Dream-Den/ })
    expect(f.mock.calls[0][0]).toBe('/api/commanders/eligible?role=companion')
    expect(screen.queryByRole('option', { name: /Sol Ring/ })).toBeNull()
    await userEvent.click(option)
    expect(onChange).toHaveBeenCalledWith(cards[0])
  })

  it('companion: shows the loading line, then the empty message', async () => {
    let release: (r: Response) => void = () => {}
    mockFetch(() => new Promise<Response>((res) => { release = res }))
    render(<ReviewCommanderSelect slot="companion" cards={cards} value={null} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Companion/ }))
    expect(await screen.findByText(/Checking which cards are companions/)).toBeTruthy()
    release(Response.json({ eligible: [] }))
    expect(await screen.findByText('No card in this deck has Companion.')).toBeTruthy()
  })

  it('companion: shows a plain error when the check fails', async () => {
    mockFetch(() => new Response('{}', { status: 500 }))
    render(<ReviewCommanderSelect slot="companion" cards={cards} value={null} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Companion/ }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't check companions/)
  })

  it('second: sends the commander it must pair with', async () => {
    const f = mockFetch(() => Response.json({ eligible: [] }))
    render(<ReviewCommanderSelect slot="second" withName="Atraxa" cards={cards} value={null} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Partner or Background/ }))
    await waitFor(() => expect(f).toHaveBeenCalled())
    expect(f.mock.calls[0][0]).toBe('/api/commanders/eligible?role=second')
    expect(JSON.parse(String(f.mock.calls[0][1].body))).toMatchObject({ with: 'Atraxa' })
    expect(await screen.findByText('No card in this deck can pair with this commander.')).toBeTruthy()
  })

  it('shows the picked card, and the none label when empty', () => {
    const { rerender } = render(<ReviewCommanderSelect slot="companion" cards={cards} value={null} onChange={() => {}} />)
    expect(screen.getByText('No companion')).toBeTruthy()
    rerender(<ReviewCommanderSelect slot="companion" cards={cards} value={cards[0]} onChange={() => {}} />)
    expect(screen.getByText('Lurrus of the Dream-Den')).toBeTruthy()
  })
})
