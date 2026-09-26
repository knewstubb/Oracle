import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { StateButtonGroup } from '../StateButtonGroup'

describe('StateButtonGroup', () => {
  it('renders all options', () => {
    render(
      <StateButtonGroup
        value="planned"
        options={['planned', 'sleeved', 'proxy']}
        onChange={vi.fn()}
        aria-label="Sol Ring state"
      />
    )
    expect(screen.getByRole('radio', { name: 'Planned' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sleeved' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Proxy' })).toBeInTheDocument()
  })

  it('marks the current value as checked', () => {
    render(
      <StateButtonGroup
        value="sleeved"
        options={['planned', 'sleeved', 'proxy']}
        onChange={vi.fn()}
        aria-label="Sol Ring state"
      />
    )
    expect(screen.getByRole('radio', { name: 'Sleeved' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Planned' })).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange when a new option is clicked', () => {
    const onChange = vi.fn()
    render(
      <StateButtonGroup
        value="planned"
        options={['planned', 'sleeved', 'proxy']}
        onChange={onChange}
        aria-label="Sol Ring state"
      />
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Proxy' }))
    expect(onChange).toHaveBeenCalledWith('proxy')
  })

  it('disables options according to isOptionDisabled', () => {
    render(
      <StateButtonGroup
        value="planned"
        options={['planned', 'sleeved', 'proxy']}
        onChange={vi.fn()}
        isOptionDisabled={(option) => option === 'sleeved'}
        disabledReason="All owned copies are already sleeved"
        aria-label="Sol Ring state"
      />
    )
    expect(screen.getByRole('radio', { name: 'Sleeved' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Sleeved' })).toHaveAttribute(
      'title',
      'All owned copies are already sleeved'
    )
    expect(screen.getByRole('radio', { name: 'Planned' })).not.toBeDisabled()
  })

  it('exposes an accessible group label', () => {
    render(
      <StateButtonGroup
        value="planned"
        options={['planned', 'sleeved']}
        onChange={vi.fn()}
        aria-label="Sol Ring state for mURZAnary tactics"
      />
    )
    expect(screen.getByRole('group')).toHaveAttribute(
      'aria-label',
      'Sol Ring state for mURZAnary tactics'
    )
  })
})
