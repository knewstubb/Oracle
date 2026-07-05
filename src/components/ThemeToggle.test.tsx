import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'

const mockSetTheme = vi.fn()
let mockTheme = 'light'

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
  }),
}))

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockTheme = 'light'
    mockSetTheme.mockClear()
  })

  it('renders a toggle button', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: /switch to dark mode/i })
    expect(button).toBeInTheDocument()
  })

  it('switches to dark mode when clicked in light mode', () => {
    mockTheme = 'light'
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: /switch to dark mode/i })
    fireEvent.click(button)
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('switches to light mode when clicked in dark mode', () => {
    mockTheme = 'dark'
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: /switch to light mode/i })
    fireEvent.click(button)
    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })
})
