import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CollectionTagFilter, TagEmptyState, TagSummaryLine } from './CollectionTagFilter'
import type { TagMatch } from '@/lib/card-tags-read'
import { CollectionToolbar } from './CollectionToolbar'

function Harness({ initial = [] as string[], count = 12 as number | null, onChange }: { initial?: string[]; count?: number | null; onChange?: (k: string[]) => void }) {
  const [tags, setTags] = useState(initial)
  const [match, setMatch] = useState<TagMatch>('all')
  return (
    <>
      <CollectionTagFilter
        selectedTags={tags}
        onTagsChange={(k) => {
          setTags(k)
          onChange?.(k)
        }}
        tagsMatch={match}
        onTagsMatchChange={setMatch}
        resultCount={count}
      />
      <TagSummaryLine selectedTags={tags} tagsMatch={match} resultCount={count} onClear={() => setTags([])} />
    </>
  )
}
const open = () => fireEvent.click(screen.getByRole('button', { name: /^Tags/ }))

describe('CollectionTagFilter', () => {
  it('is one "Tags" button, closed until opened', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists the 40 Tags as real checkboxes in two groups, broad first (13) then mechanic (27)', () => {
    render(<Harness />)
    open()
    const dialog = screen.getByRole('dialog', { name: 'Filter by Tag' })
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(40)
    const groups = within(dialog).getAllByRole('group')
    expect(within(groups[0]).getAllByRole('checkbox')).toHaveLength(13)
    expect(within(groups[1]).getAllByRole('checkbox')).toHaveLength(27)
    expect(within(groups[0]).getAllByRole('checkbox')[0]).toHaveAccessibleName('Targeted removal')
    expect(screen.getByText('Cards released after 7 August 2026 have no Tags yet.')).toBeInTheDocument()
  })

  it('opens with focus in "Find a Tag", and the find box only narrows the list of 40', () => {
    render(<Harness />)
    open()
    const find = screen.getByLabelText('Find a Tag in this list')
    expect(find).toHaveFocus()
    fireEvent.change(find, { target: { value: 'sacri' } })
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? c.parentElement?.textContent)).toEqual(['Sacrifice outlet'])
    fireEvent.change(find, { target: { value: 'zzzz' } })
    expect(screen.getByText('No Tag has that word in its name.')).toBeInTheDocument()
  })

  it('ticking applies at once, the button shows the count, and the summary line names the Tags', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    open()
    fireEvent.click(screen.getByLabelText('Sacrifice outlet'))
    expect(onChange).toHaveBeenLastCalledWith(['sacrifice_outlet'])
    expect(screen.getByRole('button', { name: 'Tags: 1 selected' })).toHaveTextContent('Tags: 1')
    fireEvent.click(screen.getByLabelText('Treasure generator'))
    expect(screen.getByText(/Tags: Sacrifice outlet, Treasure generator \(all of them\) · 12 cards/)).toBeInTheDocument()
  })

  it('"All of them" is the default once two are picked, "Any of them" is one tap away, and neither shows with one pick', () => {
    render(<Harness />)
    open()
    fireEvent.click(screen.getByLabelText('Ramp'))
    expect(screen.queryByRole('radio', { name: /All of them/ })).toBeNull()
    fireEvent.click(screen.getByLabelText('Tutor'))
    expect(screen.getByRole('radio', { name: 'All of them' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Any of them' }))
    expect(screen.getByRole('radio', { name: 'Any of them' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/\(any of them\)/)).toBeInTheDocument()
  })

  it('Clear Tags empties the choice; the count reads Checking… while the list is loading', () => {
    render(<Harness initial={['ramp']} count={null} />)
    expect(screen.getAllByText(/Checking…/).length).toBeGreaterThan(0)
    open()
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear Tags' })[0])
    expect(screen.getByRole('button', { name: 'Tags' })).toBeInTheDocument()
  })

  it('Escape closes the panel and returns focus to the Tags button; Done closes it too', () => {
    render(<Harness />)
    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveFocus()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('every control is at least 44px high (min-h-11 or 12) and rows are labelled by their Tag name', () => {
    render(<Harness initial={['ramp', 'tutor']} />)
    open()
    const dialog = screen.getByRole('dialog')
    for (const b of within(dialog).getAllByRole('button')) expect(b.className).toMatch(/min-h-1[12]/)
    expect(within(dialog).getByLabelText('Find a Tag in this list').className).toMatch(/min-h-11/)
    for (const row of within(dialog).getAllByRole('checkbox')) expect(row.closest('label')!.className).toMatch(/min-h-1[12]/)
    expect(screen.getByRole('button', { name: /^Tags: 2/ }).className).toMatch(/min-h-11/)
  })
})

describe('TagEmptyState', () => {
  it('says what was asked and offers Clear Tags and Clear all filters', () => {
    const clearTags = vi.fn()
    const clearAll = vi.fn()
    render(<TagEmptyState selectedTags={['ramp', 'tutor']} tagsMatch="all" onClearTags={clearTags} onClearAll={clearAll} />)
    expect(screen.getByText('No cards match')).toBeInTheDocument()
    expect(screen.getByText(/You own no cards with all of these Tags: Ramp, Tutor\./)).toBeInTheDocument()
    expect(screen.getByText('Try Any of them, or take a Tag off.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear Tags' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    expect(clearTags).toHaveBeenCalled()
    expect(clearAll).toHaveBeenCalled()
  })
  it('with one Tag the hint is "Try taking a filter off."', () => {
    render(<TagEmptyState selectedTags={['ramp']} tagsMatch="all" onClearTags={() => {}} onClearAll={() => {}} />)
    expect(screen.getByText('Try taking a filter off.')).toBeInTheDocument()
    expect(screen.getByText('You own no cards with the Tag Ramp.')).toBeInTheDocument()
  })
})

describe('in the collection toolbar', () => {
  it('the Tags button sits at the end of the filter row, after the colour, status and Basic controls', () => {
    render(
      <CollectionToolbar
        searchQuery="" onSearchChange={() => {}} sortField="cardName" onSortFieldChange={() => {}} sortDirection="asc" onSortDirectionChange={() => {}}
        viewMode="grid" onViewModeChange={() => {}} selectedColors={[]} onColorsChange={() => {}} colorMode="exact" onColorModeChange={() => {}}
        activeStatuses={[]} onStatusChange={() => {}} basicOnly={false} onBasicOnlyChange={() => {}}
        tagControl={<Harness />}
      />
    )
    const basic = screen.getByRole('button', { name: /^Basic/ })
    const tags = screen.getByRole('button', { name: 'Tags' })
    expect(basic.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('words', () => {
  it('no screen text in the filter says "role"', () => {
    render(<Harness initial={['ramp', 'tutor']} />)
    open()
    expect(document.body.textContent).not.toMatch(/\brole/i)
  })
})
