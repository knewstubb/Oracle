import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CardArtPreview } from './CardArtPreview'

// Mock next/image to render a plain img tag for testing
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    const { blurDataURL, unoptimized, priority, ...rest } = props
    return <img {...rest} />
  },
}))

describe('CardArtPreview', () => {
  const defaultProps = {
    scryfallId: 'abc12345-6789-0000-0000-000000000000',
    cardName: 'Sol Ring',
  }

  it('renders children without preview initially', () => {
    render(
      <CardArtPreview {...defaultProps}>
        <span>Sol Ring</span>
      </CardArtPreview>
    )
    expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    // Preview image should NOT be visible initially
    expect(screen.queryByAltText('Sol Ring')).not.toBeInTheDocument()
  })

  it('shows preview on mouse enter', async () => {
    render(
      <CardArtPreview {...defaultProps}>
        <span>Sol Ring</span>
      </CardArtPreview>
    )
    const trigger = screen.getByText('Sol Ring').closest('span[tabindex]')!
    fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 })

    await waitFor(() => {
      expect(screen.getByAltText('Sol Ring')).toBeInTheDocument()
    })
  })

  it('dismisses preview on mouse leave', async () => {
    render(
      <CardArtPreview {...defaultProps}>
        <span>Sol Ring</span>
      </CardArtPreview>
    )
    const trigger = screen.getByText('Sol Ring').closest('span[tabindex]')!
    fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 })

    await waitFor(() => {
      expect(screen.getByAltText('Sol Ring')).toBeInTheDocument()
    })

    fireEvent.mouseLeave(trigger)

    await waitFor(() => {
      expect(screen.queryByAltText('Sol Ring')).not.toBeInTheDocument()
    })
  })

  it('shows preview on keyboard focus', async () => {
    render(
      <CardArtPreview {...defaultProps}>
        <span>Sol Ring</span>
      </CardArtPreview>
    )
    const trigger = screen.getByText('Sol Ring').closest('span[tabindex]')!
    fireEvent.focus(trigger)

    await waitFor(() => {
      expect(screen.getByAltText('Sol Ring')).toBeInTheDocument()
    })
  })

  it('dismisses preview on blur', async () => {
    render(
      <CardArtPreview {...defaultProps}>
        <span>Sol Ring</span>
      </CardArtPreview>
    )
    const trigger = screen.getByText('Sol Ring').closest('span[tabindex]')!
    fireEvent.focus(trigger)

    await waitFor(() => {
      expect(screen.getByAltText('Sol Ring')).toBeInTheDocument()
    })

    fireEvent.blur(trigger)

    await waitFor(() => {
      expect(screen.queryByAltText('Sol Ring')).not.toBeInTheDocument()
    })
  })

  it('preview has aria-hidden="true" (decorative, no interactive content)', async () => {
    render(
      <CardArtPreview {...defaultProps}>
        <span>Sol Ring</span>
      </CardArtPreview>
    )
    const trigger = screen.getByText('Sol Ring').closest('span[tabindex]')!
    fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 })

    await waitFor(() => {
      const previewContainer = screen.getByAltText('Sol Ring').closest('[aria-hidden]')
      expect(previewContainer).toHaveAttribute('aria-hidden', 'true')
    })
  })

  it('preview contains no interactive elements (buttons, links, inputs)', async () => {
    render(
      <CardArtPreview {...defaultProps}>
        <span>Sol Ring</span>
      </CardArtPreview>
    )
    const trigger = screen.getByText('Sol Ring').closest('span[tabindex]')!
    fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 })

    await waitFor(() => {
      const previewContainer = screen.getByAltText('Sol Ring').closest('[aria-hidden]')!
      expect(previewContainer.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0)
    })
  })

  it('renders children directly when scryfallId is empty', () => {
    render(
      <CardArtPreview scryfallId="" cardName="Unknown Card">
        <span>Unknown Card</span>
      </CardArtPreview>
    )
    expect(screen.getByText('Unknown Card')).toBeInTheDocument()
    // No tabindex wrapper when no scryfallId
    const trigger = screen.getByText('Unknown Card').closest('span[tabindex]')
    expect(trigger).toBeNull()
  })

  it('constructs the correct Scryfall URL', async () => {
    render(
      <CardArtPreview {...defaultProps}>
        <span>Sol Ring</span>
      </CardArtPreview>
    )
    const trigger = screen.getByText('Sol Ring').closest('span[tabindex]')!
    fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 })

    await waitFor(() => {
      const img = screen.getByAltText('Sol Ring')
      expect(img).toHaveAttribute(
        'src',
        'https://cards.scryfall.io/normal/front/a/b/abc12345-6789-0000-0000-000000000000.jpg'
      )
    })
  })

  it('uses pointer-events-none on the preview (non-interactive)', async () => {
    render(
      <CardArtPreview {...defaultProps}>
        <span>Sol Ring</span>
      </CardArtPreview>
    )
    const trigger = screen.getByText('Sol Ring').closest('span[tabindex]')!
    fireEvent.mouseEnter(trigger, { clientX: 100, clientY: 100 })

    await waitFor(() => {
      const previewContainer = screen.getByAltText('Sol Ring').closest('[aria-hidden]')!
      expect(previewContainer.classList.contains('pointer-events-none')).toBe(true)
    })
  })
})
