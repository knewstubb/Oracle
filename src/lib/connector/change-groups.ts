// Folds log rows (one per card) into one entry per request (group). Rows arrive newest first.
import { describeGroup, undoRefusalText } from './change-sentences'
import type { ChangeGroupView } from './api-types'
import type { ChangeLogRow } from './write-types'

export function groupChanges(rows: ChangeLogRow[]): ChangeGroupView[] {
  const order: string[] = []
  const by = new Map<string, ChangeLogRow[]>()
  for (const r of rows) {
    const list = by.get(r.group_id)
    if (list) list.push(r)
    else {
      by.set(r.group_id, [r])
      order.push(r.group_id)
    }
  }
  return order.map((id) => {
    const g = by.get(id)!
    const first = g[0]
    const { summary, consequence } = describeGroup(g)
    const blocker = g.find((r) => r.undo_blocker)?.undo_blocker ?? null
    const undone = g.every((r) => r.undone_at)
    return {
      ...first,
      owner_only: g.some((r) => r.owner_only),
      undo_blocker: blocker,
      summary,
      consequence,
      card_count: g.length,
      cards: g.map((r) => r.card_name),
      refusal_text: !undone && blocker ? undoRefusalText(blocker) : null,
    }
  })
}
