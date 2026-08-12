/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderInlineContent, renderMessageContent } from '../render-card-links'

// Mock the CardHoverPreview module
vi.mock('@/components/CardHoverPreview', () => ({
  useCardHoverPreview: () => ({ triggerProps: {} }),
  usePartnerHoverPreview: () => ({ triggerProps: {}, scryfallId1: 'mock-id-1', scryfallId2: 'mock-id-2' }),
  getCardInfo: vi.fn().mockImplementation((cardName: string) => {
    // Return canBeCommander: true for legendary creatures used in tests
    const commanders = [
      'Korvold, Fae-Cursed King',
      'Niv-Mizzet, Parun',
      "Thassa's Oracle",
      'Urza, Lord High Artificer',
      'Tymna the Weaver',
      'Thrasios, Triton Hero',
    ]
    return Promise.resolve({
      scryfallId: 'mock-scryfall-id',
      canBeCommander: commanders.includes(cardName),
    })
  }),
}))

describe('renderInlineContent', () => {
  describe('bracket card links', () => {
    it('parses single [[Card Name]] into a clickable link', () => {
      const result = renderInlineContent('Try [[Niv-Mizzet, Parun]] for card draw')
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByText('Niv-Mizzet, Parun')).toBeInTheDocument()
      expect(screen.getByText('Niv-Mizzet, Parun')).toHaveClass('text-[#2dd4a8]')
    })

    it('parses multiple [[Card Name]] patterns', () => {
      const result = renderInlineContent('Consider [[Sol Ring]], [[Mana Crypt]], or [[Arcane Signet]]')
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
      expect(screen.getByText('Mana Crypt')).toBeInTheDocument()
      expect(screen.getByText('Arcane Signet')).toBeInTheDocument()
    })

    it('handles card names with commas', () => {
      const result = renderInlineContent('[[Korvold, Fae-Cursed King]] is powerful')
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByText('Korvold, Fae-Cursed King')).toBeInTheDocument()
    })

    it('handles card names with apostrophes', () => {
      const result = renderInlineContent("[[Thassa's Oracle]] wins games")
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByText("Thassa's Oracle")).toBeInTheDocument()
    })

    it('handles card names with numbers', () => {
      const result = renderInlineContent('[[Urza, Lord High Artificer]] is strong')
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByText('Urza, Lord High Artificer')).toBeInTheDocument()
    })

    it('preserves surrounding text', () => {
      const result = renderInlineContent('Before [[Card]] after')
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByText('Before')).toBeInTheDocument()
      expect(screen.getByText('Card')).toBeInTheDocument()
      expect(screen.getByText('after')).toBeInTheDocument()
    })
  })

  describe('bold formatting', () => {
    it('parses **bold** text', () => {
      const result = renderInlineContent('This is **important** text')
      render(<div data-testid="content">{result}</div>)
      
      const boldElement = screen.getByText('important')
      expect(boldElement.tagName).toBe('STRONG')
      expect(boldElement).toHaveClass('font-medium')
    })

    it('handles nested [[card]] inside **bold**', () => {
      const result = renderInlineContent('**Try [[Sol Ring]]** for ramp')
      render(<div data-testid="content">{result}</div>)
      
      // The card link should still be rendered
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
    })
  })

  describe('italic formatting', () => {
    it('parses *italic* text', () => {
      const result = renderInlineContent('This is *emphasized* text')
      render(<div data-testid="content">{result}</div>)
      
      const italicElement = screen.getByText('emphasized')
      expect(italicElement.tagName).toBe('EM')
    })
  })

  describe('onCardClick callback', () => {
    it('calls onAction when action button is clicked in add mode', () => {
      const mockAction = vi.fn()
      const result = renderInlineContent('[[Sol Ring]]', 'add', mockAction)
      render(<div data-testid="content">{result}</div>)
      
      const addButton = screen.getByRole('button', { name: /add sol ring to deck/i })
      addButton.click()
      
      expect(mockAction).toHaveBeenCalledWith('Sol Ring')
    })
    
    it('calls onAction when crown button is clicked in crown mode', () => {
      const mockAction = vi.fn()
      // Use Korvold, a legendary creature that can be a commander
      const result = renderInlineContent('[[Korvold, Fae-Cursed King]]', 'crown', mockAction)
      render(<div data-testid="content">{result}</div>)
      
      const crownButton = screen.getByRole('button', { name: /select korvold, fae-cursed king as commander/i })
      crownButton.click()
      
      expect(mockAction).toHaveBeenCalledWith('Korvold, Fae-Cursed King')
    })
  })

  describe('action button modes', () => {
    it('shows + button when mode is add and onAction provided', () => {
      const mockAction = vi.fn()
      const result = renderInlineContent('[[Sol Ring]]', 'add', mockAction)
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByRole('button', { name: /add sol ring to deck/i })).toBeInTheDocument()
    })
    
    it('shows crown button when mode is crown and onAction provided', () => {
      const mockAction = vi.fn()
      // Use Niv-Mizzet, a legendary creature that can be a commander
      const result = renderInlineContent('[[Niv-Mizzet, Parun]]', 'crown', mockAction)
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByRole('button', { name: /select niv-mizzet, parun as commander/i })).toBeInTheDocument()
    })

    it('does not show crown button for non-commanders in crown mode', () => {
      const mockAction = vi.fn()
      // Sol Ring is not a commander — should not show crown
      const result = renderInlineContent('[[Sol Ring]]', 'crown', mockAction)
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.queryByRole('button', { name: /select sol ring as commander/i })).not.toBeInTheDocument()
    })

    it('does not show action button when mode is none', () => {
      const mockAction = vi.fn()
      const result = renderInlineContent('[[Sol Ring]]', 'none', mockAction)
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
    
    it('does not show action button when onAction not provided', () => {
      const result = renderInlineContent('[[Sol Ring]]', 'add')
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = renderInlineContent('')
      render(<div data-testid="content">{result}</div>)
      
      // Empty string still creates a span wrapper, but with no visible text
      const content = screen.getByTestId('content')
      expect(content.textContent).toBe('')
    })

    it('handles text with no special formatting', () => {
      const result = renderInlineContent('Plain text without any formatting')
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByText('Plain text without any formatting')).toBeInTheDocument()
    })

    it('handles unclosed brackets', () => {
      const result = renderInlineContent('[[Unclosed bracket')
      render(<div data-testid="content">{result}</div>)
      
      // Should render as plain text since it's not a valid pattern
      expect(screen.getByText('[[Unclosed bracket')).toBeInTheDocument()
    })

    it('handles nested brackets (should not match)', () => {
      const result = renderInlineContent('[[Outer [[Inner]] text]]')
      render(<div data-testid="content">{result}</div>)
      
      // The regex should handle this gracefully
      expect(screen.getByTestId('content')).toBeInTheDocument()
    })
  })
})

describe('renderMessageContent', () => {
  describe('multiline content', () => {
    it('renders bullet points', () => {
      const result = renderMessageContent('- First item\n- Second item')
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByText('First item')).toBeInTheDocument()
      expect(screen.getByText('Second item')).toBeInTheDocument()
      // Bullet point markers
      expect(screen.getAllByText('•')).toHaveLength(2)
    })

    it('handles bullet points with card links', () => {
      const result = renderMessageContent('- [[Sol Ring]] for ramp\n- [[Mana Crypt]] is fast')
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByText('Sol Ring')).toBeInTheDocument()
      expect(screen.getByText('Mana Crypt')).toBeInTheDocument()
    })

    it('renders empty lines as spacing', () => {
      const result = renderMessageContent('First paragraph\n\nSecond paragraph')
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByText('First paragraph')).toBeInTheDocument()
      expect(screen.getByText('Second paragraph')).toBeInTheDocument()
    })
  })

  describe('integration', () => {
    it('handles complex message with mixed content', () => {
      const content = `Here are some **commander** options:
- [[Korvold, Fae-Cursed King]] for *sacrifice* strategies
- [[Meren of Clan Nel Toth]] for graveyard recursion

Both are powerful in their archetypes.`
      
      const result = renderMessageContent(content)
      render(<div data-testid="content">{result}</div>)
      
      expect(screen.getByText('commander')).toBeInTheDocument()
      expect(screen.getByText('Korvold, Fae-Cursed King')).toBeInTheDocument()
      expect(screen.getByText('sacrifice')).toBeInTheDocument()
      expect(screen.getByText('Meren of Clan Nel Toth')).toBeInTheDocument()
    })
  })
})
