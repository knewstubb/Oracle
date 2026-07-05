import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CardImage } from './CardImage'

// Mock next/image to render a plain img tag for testing
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    const { blurDataURL, unoptimized, priority, ...rest } = props
    return <img {...rest} />
  },
}))

describe('CardImage', () => {
  it('renders an image with the correct Scryfall CDN URL (normal)', () => {
    render(
      <CardImage
        scryfallId="abc12345-6789-0000-0000-000000000000"
        alt="Test card art"
      />
    )
    const img = screen.getByRole('img', { name: 'Test card art' })
    expect(img).toHaveAttribute(
      'src',
      'https://cards.scryfall.io/normal/front/a/b/abc12345-6789-0000-0000-000000000000.jpg'
    )
  })

  it('renders art_crop URL when artCrop prop is set', () => {
    render(
      <CardImage
        scryfallId="abc12345-6789-0000-0000-000000000000"
        alt="Test art crop"
        artCrop
      />
    )
    const img = screen.getByRole('img', { name: 'Test art crop' })
    expect(img).toHaveAttribute(
      'src',
      'https://cards.scryfall.io/art_crop/front/a/b/abc12345-6789-0000-0000-000000000000.jpg'
    )
  })

  it('shows fallback on error', () => {
    render(
      <CardImage
        scryfallId="abc12345-6789-0000-0000-000000000000"
        alt="Broken card"
      />
    )
    const img = screen.getByRole('img', { name: 'Broken card' })
    fireEvent.error(img)
    // After error, should show fallback div
    expect(screen.getByText('No image')).toBeInTheDocument()
  })

  it('shows fallback when scryfallId is empty', () => {
    render(<CardImage scryfallId="" alt="Missing card" />)
    expect(screen.getByText('No image')).toBeInTheDocument()
  })
})
