import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ManaBoxRowSplit } from '../../../docs/oracle/contracts/manabox-import.types'
import { CopyTypeControl } from './CopyTypeControl'
import { CopyCountStepper } from './CopyCountStepper'
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
  const [editing, setEditing] = useState<CopyType | null>(null)
  return (
    <div>
      <button>outside</button>
      <CopyTypeControl
        qty={qty}
        split={split}
        onChange={(s) => {
          setSplit(s)
          onSplit?.(s)
        }}
        editingType={editing}
        onEditingTypeChange={setEditing}
        options={OPTIONS}
        cardName="Goblin"
      />
    </div>
  )
}

const number = () => screen.getByRole('spinbutton')

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

describe('CopyTypeControl — 2+ copy rows', () => {
  it('opens the in-place stepper on Proxy with all copies and no dialog', () => {
    const onSplit = vi.fn()
    render(<Harness qty={3} onSplit={onSplit} />)
    fireEvent.click(screen.getByRole('button', { name: /Proxy/i }))
    expect(onSplit).toHaveBeenCalledWith({ originalCount: 0, proxyCount: 3, unsleevedCount: 0 })
    expect(number()).toHaveAttribute('aria-valuenow', '3')
    expect(screen.getByText('Original 0')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: /Original/ })).toBeNull()
  })

  it('opens for Unsleeved too', () => {
    render(<Harness qty={2} />)
    fireEvent.click(screen.getByRole('button', { name: /Unsleeved/i }))
    expect(screen.getByRole('group', { name: /unsleeved/i })).toBeInTheDocument()
  })

  it('decrements and increments within 1..qty with disabled ends', () => {
    render(<Harness qty={3} />)
    fireEvent.click(screen.getByRole('button', { name: /Proxy/i }))
    const fewer = screen.getByRole('button', { name: 'Fewer proxies' })
    const more = screen.getByRole('button', { name: 'More proxies' })
    expect(more).toBeDisabled()
    fireEvent.click(fewer)
    fireEvent.click(fewer)
    expect(number()).toHaveAttribute('aria-valuenow', '1')
    expect(fewer).toBeDisabled()
    expect(screen.getByText('Original 2')).toBeInTheDocument()
    fireEvent.click(fewer)
    expect(number()).toHaveAttribute('aria-valuenow', '1')
    fireEvent.click(more)
    expect(number()).toHaveAttribute('aria-valuenow', '2')
    expect(screen.getByText('Original 1')).toBeInTheDocument()
  })

  it('supports keyboard: arrows, Home/End, no wrap', () => {
    render(<Harness qty={4} />)
    fireEvent.click(screen.getByRole('button', { name: /Proxy/i }))
    expect(number()).toHaveFocus()
    fireEvent.keyDown(number(), { key: 'ArrowUp' })
    expect(number()).toHaveAttribute('aria-valuenow', '4')
    fireEvent.keyDown(number(), { key: 'Home' })
    expect(number()).toHaveAttribute('aria-valuenow', '1')
    fireEvent.keyDown(number(), { key: 'ArrowDown' })
    expect(number()).toHaveAttribute('aria-valuenow', '1')
    fireEvent.keyDown(number(), { key: 'End' })
    expect(number()).toHaveAttribute('aria-valuenow', '4')
  })

  it('all copies = whole row: stepper at qty yields all proxy', () => {
    const onSplit = vi.fn()
    render(<Harness qty={2} onSplit={onSplit} />)
    fireEvent.click(screen.getByRole('button', { name: /Proxy/i }))
    expect(onSplit).toHaveBeenLastCalledWith({ originalCount: 0, proxyCount: 2, unsleevedCount: 0 })
  })

  it('Escape collapses keeping the number and shows "Original 1 · Proxy 1"', () => {
    render(<Harness qty={2} />)
    fireEvent.click(screen.getByRole('button', { name: /Proxy/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Fewer proxies' }))
    fireEvent.keyDown(number(), { key: 'Escape' })
    expect(screen.queryByRole('spinbutton')).toBeNull()
    const orig = screen.getByRole('button', { name: 'Original, 1 of 2' })
    const proxy = screen.getByRole('button', { name: 'Proxy, 1 of 2' })
    expect(orig).toHaveTextContent('Original1')
    expect(proxy).toHaveTextContent('Proxy1')
    expect(proxy).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Goblin: 1 original, 1 proxy')
  })

  it('outside click collapses keeping the number', () => {
    render(<Harness qty={3} />)
    fireEvent.click(screen.getByRole('button', { name: /Proxy/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Fewer proxies' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.getByRole('button', { name: 'Proxy, 2 of 3' })).toBeInTheDocument()
  })

  it('reopens at the current number when clicking a type in use', () => {
    render(<Harness qty={3} initial={{ originalCount: 1, proxyCount: 2, unsleevedCount: 0 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Proxy, 2 of 3' }))
    expect(number()).toHaveAttribute('aria-valuenow', '2')
  })

  it('Original click never opens the stepper', () => {
    render(<Harness qty={3} />)
    fireEvent.click(screen.getByRole('button', { name: /Original/i }))
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })
})

describe('CopyCountStepper', () => {
  it('reports changes and closes with refocus on Enter', () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    render(
      <CopyCountStepper qty={3} type="proxy" value={1} cardName="Goblin" onChange={onChange} onClose={onClose} />
    )
    expect(screen.getByText('Original 2')).toHaveAttribute('aria-live', 'polite')
    fireEvent.keyDown(number(), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(2)
    fireEvent.keyDown(number(), { key: 'Enter' })
    expect(onClose).toHaveBeenCalledWith(true)
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
