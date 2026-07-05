import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModelSelector } from './ModelSelector'

describe('ModelSelector', () => {
  const mockOnModelChange = vi.fn()

  beforeEach(() => {
    mockOnModelChange.mockClear()
  })

  it('renders a select element with the correct aria label', () => {
    render(
      <ModelSelector selectedModelId="sonnet-4" onModelChange={mockOnModelChange} />
    )
    expect(screen.getByLabelText('Select AI model')).toBeInTheDocument()
  })

  it('displays the selected model as the current value', () => {
    render(
      <ModelSelector selectedModelId="gemini-35-flash" onModelChange={mockOnModelChange} />
    )
    const select = screen.getByLabelText('Select AI model') as HTMLSelectElement
    expect(select.value).toBe('gemini-35-flash')
  })

  it('renders all available model options with pricing info', () => {
    render(
      <ModelSelector selectedModelId="sonnet-4" onModelChange={mockOnModelChange} />
    )
    const options = screen.getAllByRole('option')
    expect(options.length).toBe(5)
    expect(options[0].textContent).toContain('Claude Sonnet 4')
    expect(options[0].textContent).toContain('$3/$15 per 1M tokens')
  })

  it('calls onModelChange when a different model is selected', () => {
    render(
      <ModelSelector selectedModelId="sonnet-4" onModelChange={mockOnModelChange} />
    )
    const select = screen.getByLabelText('Select AI model')
    fireEvent.change(select, { target: { value: 'deepseek-v4-pro' } })
    expect(mockOnModelChange).toHaveBeenCalledWith('deepseek-v4-pro')
  })

  it('disables the select when disabled prop is true', () => {
    render(
      <ModelSelector
        selectedModelId="sonnet-4"
        onModelChange={mockOnModelChange}
        disabled={true}
      />
    )
    const select = screen.getByLabelText('Select AI model') as HTMLSelectElement
    expect(select.disabled).toBe(true)
  })

  it('applies reduced opacity when disabled', () => {
    const { container } = render(
      <ModelSelector
        selectedModelId="sonnet-4"
        onModelChange={mockOnModelChange}
        disabled={true}
      />
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('opacity-50')
  })

  it('does not apply reduced opacity when enabled', () => {
    const { container } = render(
      <ModelSelector
        selectedModelId="sonnet-4"
        onModelChange={mockOnModelChange}
        disabled={false}
      />
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).not.toContain('opacity-50')
  })

  it('renders a provider colour dot for Anthropic (orange)', () => {
    const { container } = render(
      <ModelSelector selectedModelId="sonnet-4" onModelChange={mockOnModelChange} />
    )
    const dot = container.querySelector('span[aria-hidden="true"]') as HTMLElement
    expect(dot.style.backgroundColor).toBe('rgb(249, 115, 22)')
  })

  it('renders a provider colour dot for Gemini (blue)', () => {
    const { container } = render(
      <ModelSelector selectedModelId="gemini-35-flash" onModelChange={mockOnModelChange} />
    )
    const dot = container.querySelector('span[aria-hidden="true"]') as HTMLElement
    expect(dot.style.backgroundColor).toBe('rgb(59, 130, 246)')
  })

  it('renders a provider colour dot for DeepSeek (green)', () => {
    const { container } = render(
      <ModelSelector selectedModelId="deepseek-v4-pro" onModelChange={mockOnModelChange} />
    )
    const dot = container.querySelector('span[aria-hidden="true"]') as HTMLElement
    expect(dot.style.backgroundColor).toBe('rgb(34, 197, 94)')
  })

  it('falls back to the first model if an unknown modelId is provided', () => {
    render(
      <ModelSelector selectedModelId="unknown-model" onModelChange={mockOnModelChange} />
    )
    const { container } = render(
      <ModelSelector selectedModelId="unknown-model" onModelChange={mockOnModelChange} />
    )
    // Dot should be orange (Anthropic, the default/first model)
    const dot = container.querySelector('span[aria-hidden="true"]') as HTMLElement
    expect(dot.style.backgroundColor).toBe('rgb(249, 115, 22)')
  })
})
