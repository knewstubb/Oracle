import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ColorIdentityFilter } from './ColorIdentityFilter'

// Mock next/image to render a plain img tag for testing
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

describe('ColorIdentityFilter', () => {
  it('uses the selected colour for the pip ring', () => {
    render(<ColorIdentityFilter value="U" onChange={() => {}} />)
    const blue = screen.getByRole('button', { name: 'Remove Blue' })
    expect(blue.style.getPropertyValue('--tw-ring-color')).toBe('#3B82F6')
  })

  it('leaves unselected pips without a ring colour', () => {
    render(<ColorIdentityFilter value="U" onChange={() => {}} />)
    const red = screen.getByRole('button', { name: 'Add Red' })
    expect(red.style.getPropertyValue('--tw-ring-color')).toBe('')
  })
})
