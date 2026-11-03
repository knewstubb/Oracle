import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeckImportOptions } from './DeckImportOptions'
import { ImportDefaultsBar } from './ImportDefaultsBar'
import { IMPORT_MODAL_CLASS } from './import-labels'
import { DUPLICATE_NAME_NOTE } from './import-copy'
import { INITIAL_DEFAULTS } from './types'
import { isIgnorableBasic } from '@/lib/basic-lands'
import fs from 'node:fs'
import path from 'node:path'

describe('import modal layout (spec import-modal-redesign §3)', () => {
  it('#1 puts the commander row below Name and Format', () => {
    render(
      <DeckImportOptions
        name="x"
        onNameChange={vi.fn()}
        format="commander"
        onFormatChange={vi.fn()}
        commanderSlot={<span data-testid="cmd">cmd</span>}
      />
    )
    const name = screen.getByLabelText('Name')
    const cmd = screen.getByTestId('cmd')
    expect(name.compareDocumentPosition(cmd) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Name and Format share a row that does not contain the commander.
    expect(name.closest('.grid')?.contains(cmd)).toBe(false)
    expect(name.closest('.grid')?.contains(screen.getByLabelText('Format'))).toBe(true)
  })

  it('#11 warns under the name when a deck with this name exists, and does not disable anything', () => {
    render(
      <DeckImportOptions name="Korvold" onNameChange={vi.fn()} format="commander" onFormatChange={vi.fn()} nameNote={DUPLICATE_NAME_NOTE('Korvold')} />
    )
    expect(screen.getByText(/already have a deck called "Korvold"/)).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).not.toBeDisabled()
  })

  it('#4 says the defaults apply to new copies only', async () => {
    render(<ImportDefaultsBar defaults={INITIAL_DEFAULTS} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(await screen.findByText(/Applies to new copies only/)).toBeInTheDocument()
  })

  it('#9 modal is 100% - 4rem on laptops and 90% of the screen on tall screens', () => {
    expect(IMPORT_MODAL_CLASS).toContain('h-[calc(100dvh-4rem)]')
    expect(IMPORT_MODAL_CLASS).toContain('min-height:1000px')
    expect(IMPORT_MODAL_CLASS).toContain('min(90dvh,calc(100dvh-4rem))')
  })

  it('#10 the shared dialog overlay is black 72% with an 8px blur, and nothing overrides it', () => {
    const dialog = fs.readFileSync(path.join(process.cwd(), 'src/components/ui/dialog.tsx'), 'utf8')
    expect(dialog).toContain('bg-black/72')
    expect(dialog).toContain('backdrop-blur-[8px]')
    const discard = fs.readFileSync(path.join(process.cwd(), 'src/components/manabox-import/ImportDiscardDialog.tsx'), 'utf8')
    expect(discard).not.toContain('overlayClassName')
  })

  it('#13 primary buttons use dark text #08150F globally', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toMatch(/\.dark \{[\s\S]*--primary-foreground: #08150F/)
  })

  it('ignore-basics covers the five basics and Wastes only', () => {
    for (const n of ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']) expect(isIgnorableBasic(n)).toBe(true)
    for (const n of ['Snow-Covered Forest', 'Command Tower', 'Snow-Covered Wastes']) expect(isIgnorableBasic(n)).toBe(false)
  })
})
