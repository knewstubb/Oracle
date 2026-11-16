import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('sonner', () => ({ toast: vi.fn() }))
import { toast } from 'sonner'
import { SetupGuideTab } from './SetupGuideTab'
import { connectorAddress, FALLBACK_SITE_URL } from './connector-address'

const writeText = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('connectorAddress', () => {
  it('uses the site address when set', () => expect(connectorAddress('https://oracle.example.com/')).toBe('https://oracle.example.com/mcp'))
  it('falls back to the live site when unset, empty or local', () => {
    expect(connectorAddress('')).toBe(`${FALLBACK_SITE_URL}/mcp`)
    expect(connectorAddress('http://localhost:3000')).toBe(`${FALLBACK_SITE_URL}/mcp`)
  })
})

describe('SetupGuideTab', () => {
  it('shows the top notice, footer and the four sections with the web one open', () => {
    render(<SetupGuideTab />)
    expect(screen.getByRole('note')).toHaveTextContent("Start on the web or desktop. The phone app can't add a new connector yet")
    expect(screen.getByText(/look for "connectors" in Claude's settings/)).toBeInTheDocument()
    const web = screen.getByRole('button', { name: 'Claude on the web' })
    expect(web).toHaveAttribute('aria-expanded', 'true')
    for (const n of ['Claude desktop app', 'Claude on your phone', 'Claude Code']) {
      expect(screen.getByRole('button', { name: n })).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('opens another section by keyboard', async () => {
    render(<SetupGuideTab />)
    const phone = screen.getByRole('button', { name: 'Claude on your phone' })
    phone.focus()
    await userEvent.keyboard('{Enter}')
    expect(phone).toHaveAttribute('aria-expanded', 'true')
  })

  it('copies the address and says so', async () => {
    render(<SetupGuideTab />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(writeText).toHaveBeenCalledWith(connectorAddress())
    expect(toast).toHaveBeenCalledWith('Address copied')
  })

  it('shows the one-line Claude Code command and copies it', async () => {
    render(<SetupGuideTab />)
    await userEvent.click(screen.getByRole('button', { name: 'Claude Code' }))
    const cmd = `claude mcp add --transport http oracle ${connectorAddress()}`
    expect(screen.getAllByTestId('copy-text').some((e) => e.textContent === cmd)).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Copy command' }))
    expect(writeText).toHaveBeenCalledWith(cmd)
  })

  it('says so when copying is blocked', async () => {
    writeText.mockRejectedValue(new Error('no'))
    render(<SetupGuideTab />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(toast).toHaveBeenCalledWith("Couldn't copy. Select the text and copy it yourself.")
  })

  it('never uses the banned words in what people read, and has no emoji', async () => {
    const { container } = render(<SetupGuideTab />)
    for (const n of ['Claude desktop app', 'Claude on your phone', 'Claude Code']) await userEvent.click(screen.getByRole('button', { name: n }))
    // The one command line is a literal the tool requires; everything else is plain words.
    const clone = container.cloneNode(true) as HTMLElement
    clone.querySelectorAll('code').forEach((c) => c.remove())
    const text = clone.textContent ?? ''
    expect(text).not.toMatch(/\b(MCP|OAuth|tokens?)\b/i)
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('the copy areas are labelled and reachable by keyboard', () => {
    render(<SetupGuideTab />)
    const box = screen.getAllByTestId('copy-text')[0]
    expect(box).toHaveAttribute('tabindex', '0')
    expect(within(document.body).getByLabelText('Connector address')).toBe(box)
  })
})
