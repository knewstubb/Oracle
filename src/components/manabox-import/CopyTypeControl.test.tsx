import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ManaBoxRowSplit } from '../../../docs/oracle/contracts/manabox-import.types'
import { CopyTypeControl } from './CopyTypeControl'
import { defaultSplit, setSplitCount } from './types'
import type { CopyType } from './types'

const OPTIONS: CopyType[] = ['original', 'proxy', 'unsleeved']

/** Stateful harness standing in for ImportCardList. */
function Harness({
  qty,
  initial,
  onSplit,
}: {
  qty: number
  initial?: ManaBoxRowSplit
  onSplit?: (s: ManaBoxRowSplit) => void
}) {
  const [split, setSplit] = useState(initial ?? defaultSplit(qty))
  return (
    <div>
      <CopyTypeControl
        qty={qty}
        split={split}
        onChange={(s) => {
          setSplit(s)
          onSplit?.(s)
        }}
        options={OPTIONS}
        cardName="Goblin"
      />
    </div>
  )
}

const proxyNumber = () => screen.getByRole('spinbutton', { name: 'Proxies' })

describe('CopyTypeControl — 1-copy rows', () => {
  it('selects original by default and switches to proxy with no stepper', () => {
    const onSplit = vi.fn()
    render(<Harness qty={1} onSplit={onSplit} />)
    expect(screen.getByRole('radio', { name: /Original/i })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /Proxy/i }))
    expect(onSplit).toHaveBeenCalledWith({ originalCount: 0, proxyCount: 1, unsleevedCount: 0 })
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })
})

describe('CopyTypeControl — 2+ copy rows (stepper always visible)', () => {
  it('shows Original with all copies plus a Proxy stepper at 0, no click needed', () => {
    render(<Harness qty={3} />)
    expect(screen.getByRole('button', { name: /Original, 3 of 3/ })).toBeInTheDocument()
    expect(proxyNumber()).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('button', { name: 'Fewer proxies' })).toBeDisabled()
  })

  it('+ and − move copies between Original and Proxy within 0..qty', () => {
    render(<Harness qty={2} />)
    const more = screen.getByRole('button', { name: 'More proxies' })
    const fewer = screen.getByRole('button', { name: 'Fewer proxies' })
    fireEvent.click(more)
    expect(proxyNumber()).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('button', { name: /Original, 1 of 2/ })).toBeInTheDocument()
    fireEvent.click(more)
    expect(more).toBeDisabled()
    expect(screen.getByRole('button', { name: /Original, 0 of 2/ })).toBeInTheDocument()
    fireEvent.click(fewer)
    fireEvent.click(fewer)
    expect(proxyNumber()).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('button', { name: /Original, 2 of 2/ })).toBeInTheDocument()
  })

  it('supports keyboard: arrows, Home/End, no wrap', () => {
    render(<Harness qty={4} />)
    proxyNumber().focus()
    fireEvent.keyDown(proxyNumber(), { key: 'ArrowUp' })
    expect(proxyNumber()).toHaveAttribute('aria-valuenow', '1')
    fireEvent.keyDown(proxyNumber(), { key: 'End' })
    expect(proxyNumber()).toHaveAttribute('aria-valuenow', '4')
    fireEvent.keyDown(proxyNumber(), { key: 'ArrowUp' })
    expect(proxyNumber()).toHaveAttribute('aria-valuenow', '4')
    fireEvent.keyDown(proxyNumber(), { key: 'Home' })
    expect(proxyNumber()).toHaveAttribute('aria-valuenow', '0')
    fireEvent.keyDown(proxyNumber(), { key: 'ArrowDown' })
    expect(proxyNumber()).toHaveAttribute('aria-valuenow', '0')
  })

  it('all copies proxy = whole row proxy', () => {
    const onSplit = vi.fn()
    render(<Harness qty={2} onSplit={onSplit} />)
    fireEvent.click(screen.getByRole('button', { name: 'More proxies' }))
    fireEvent.click(screen.getByRole('button', { name: 'More proxies' }))
    expect(onSplit).toHaveBeenLastCalledWith({ originalCount: 0, proxyCount: 2, unsleevedCount: 0 })
  })

  it('clicking Original puts every copy back to Original', () => {
    render(<Harness qty={3} initial={{ originalCount: 1, proxyCount: 2, unsleevedCount: 0 }} />)
    fireEvent.click(screen.getByRole('button', { name: /Original, 1 of 3/ }))
    expect(proxyNumber()).toHaveAttribute('aria-valuenow', '0')
  })

  it('Unsleeved has its own stepper on deck rows', () => {
    render(<Harness qty={2} />)
    const unsleeved = screen.getByRole('spinbutton', { name: 'Unsleeved' })
    fireEvent.keyDown(unsleeved, { key: 'ArrowUp' })
    expect(unsleeved).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('button', { name: /Original, 1 of 2/ })).toBeInTheDocument()
  })
})
describe('setSplitCount', () => {
  it('takes from Original first, then the other type; lowering returns to Original', () => {
    const s = { originalCount: 1, proxyCount: 0, unsleevedCount: 2 }
    expect(setSplitCount(s, 'proxy', 2, 3)).toEqual({ originalCount: 0, proxyCount: 2, unsleevedCount: 1 })
    expect(setSplitCount(s, 'proxy', 1, 3)).toEqual({ originalCount: 0, proxyCount: 1, unsleevedCount: 2 })
    expect(setSplitCount({ originalCount: 0, proxyCount: 3, unsleevedCount: 0 }, 'proxy', 1, 3)).toEqual({
      originalCount: 2,
      proxyCount: 1,
      unsleevedCount: 0,
    })
  })
})
