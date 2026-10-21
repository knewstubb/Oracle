/**
 * Order of the import review list. "file" keeps the order of the file (the rows
 * arrive in that order); "name" is A–Z. Sorting never changes a row, only where it sits.
 */
import type { ImportRow } from '../../docs/oracle/contracts/import-row-editing.types'

export type ImportSort = 'file' | 'name'

type Sortable = Pick<ImportRow, 'cardName' | 'setCode' | 'collectorNumber' | 'sourceIndex'>

/** Double-faced cards are listed by their front face. */
function frontName(name: string): string {
  return name.split(' // ')[0].trim()
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

export function sortImportRows<T extends Sortable>(rows: T[], sort: ImportSort): T[] {
  const copy = [...rows]
  if (sort === 'file') return copy.sort((a, b) => a.sourceIndex - b.sourceIndex)
  return copy.sort(
    (a, b) =>
      collator.compare(frontName(a.cardName), frontName(b.cardName)) ||
      collator.compare(a.setCode, b.setCode) ||
      collator.compare(a.collectorNumber, b.collectorNumber) ||
      a.sourceIndex - b.sourceIndex
  )
}
