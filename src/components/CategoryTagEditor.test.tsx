import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryTagEditor } from './CategoryTagEditor'

const LONG = 'Game Plan & Win Conditions'
const all = ['Ramp', 'Draw', 'Artifact', LONG, 'Payoffs', 'Protection']

describe('CategoryTagEditor (HC-02: up to five categories)', () => {
  it('shows a dropdown for each extra category plus one empty one, and shows long names whole', () => {
    render(<CategoryTagEditor primaryCategory="Ramp" additionalCategories={['Draw', LONG]} availableCategories={all} onChange={vi.fn()} />)
    expect(screen.getByTestId('secondary-1-select')).toHaveValue('Draw')
    expect(screen.getByTestId('secondary-2-select')).toHaveValue(LONG)
    expect(screen.getByTestId('secondary-3-select')).toHaveValue('')
    expect(screen.queryByTestId('secondary-4-select')).not.toBeInTheDocument()
  })

  it('stops at four extra categories (five in all)', () => {
    render(<CategoryTagEditor primaryCategory="Ramp" additionalCategories={['Draw', 'Artifact', LONG, 'Payoffs']} availableCategories={all} onChange={vi.fn()} />)
    expect(screen.getAllByRole('combobox')).toHaveLength(4)
  })

  it('adds a third extra category and keeps order', async () => {
    const onChange = vi.fn()
    render(<CategoryTagEditor primaryCategory="Ramp" additionalCategories={['Draw', 'Artifact']} availableCategories={all} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByTestId('secondary-3-select'), LONG)
    expect(onChange).toHaveBeenCalledWith({ primary_category: 'Ramp', additional_categories: ['Draw', 'Artifact', LONG] })
  })

  it('clearing one extra category keeps the others whole', async () => {
    const onChange = vi.fn()
    render(<CategoryTagEditor primaryCategory="Ramp" additionalCategories={['Draw', LONG, 'Payoffs']} availableCategories={all} onChange={onChange} />)
    await userEvent.click(screen.getByTestId('secondary-2-clear'))
    expect(onChange).toHaveBeenCalledWith({ primary_category: 'Ramp', additional_categories: ['Draw', 'Payoffs'] })
  })

  it('still shows a held name that the deck list does not offer', () => {
    render(<CategoryTagEditor primaryCategory="Ramp" additionalCategories={[LONG]} availableCategories={['Ramp', 'Draw']} onChange={vi.fn()} />)
    expect(screen.getByTestId('secondary-1-select')).toHaveValue(LONG)
  })
})
