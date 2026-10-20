import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CopyTypeControl, CopyCountPicker } from './CopyTypeControl'
import { defaultSplit } from './types'

describe('CopyTypeControl', () => {
  it('selects all original by default', () => {
    const onChange = vi.fn()
    render(
      <CopyTypeControl
        qty={1}
        split={defaultSplit(1)}
        onChange={onChange}
        onOpenPicker={() => {}}
        options={['original', 'proxy', 'unsleeved']}
        cardName="Sol Ring"
      />
    )
    expect(screen.getByRole('radio', { name: /Original/i })).toHaveAttribute('aria-checked', 'true')
  })

  it('switches a single copy to proxy', () => {
    const onChange = vi.fn()
    render(
      <CopyTypeControl
        qty={1}
        split={defaultSplit(1)}
        onChange={onChange}
        onOpenPicker={() => {}}
        options={['original', 'proxy', 'unsleeved']}
        cardName="Sol Ring"
      />
    )
    fireEvent.click(screen.getByRole('radio', { name: /Proxy/i }))
    expect(onChange).toHaveBeenCalledWith({ originalCount: 0, proxyCount: 1, unsleevedCount: 0 })
  })

  it('opens the count picker on a multi-copy row', () => {
    const onOpenPicker = vi.fn()
    render(
      <CopyTypeControl
        qty={3}
        split={defaultSplit(3)}
        onChange={() => {}}
        onOpenPicker={onOpenPicker}
        options={['original', 'proxy', 'unsleeved']}
        cardName="Goblin"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Proxy/i }))
    expect(onOpenPicker).toHaveBeenCalledWith('proxy')
  })
})

describe('CopyCountPicker', () => {
  it('picks a count and shows the original remainder', () => {
    const onPick = vi.fn()
    render(
      <CopyCountPicker
        qty={3}
        type="proxy"
        value={1}
        onPick={onPick}
        onClose={() => {}}
        cardName="Goblin"
      />
    )
    expect(screen.getByText('Original 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '2' }))
    expect(onPick).toHaveBeenCalledWith(2)
  })
})
