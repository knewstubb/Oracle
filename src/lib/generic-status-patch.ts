/**
 * Instant (optimistic) edits to the cached card-statuses response, so the deck totals and the
 * "Short: Island generics unsleeved" status change the moment a generic is added, removed,
 * sleeved or unsleeved. The server's answer replaces this on the next refetch.
 */

interface StatusCounts {
  size?: number
  total?: number
  generic_land?: number
  generic_unsleeved?: number
  planned?: number
  sleeved?: number
  unsleevedGenericNames?: string[]
  [key: string]: unknown
}

export type StatusPatch =
  | { size: number; generic: number; sleeved: boolean }
  | { unsleeveFlip: 'sleeve' | 'unsleeve'; amount: number; name: string }

export function applyStatusPatch<T extends { counts?: StatusCounts }>(old: T | undefined, patch: StatusPatch): T | undefined {
  if (!old?.counts) return old
  const c = { ...old.counts }
  const n = (v: number | undefined) => v ?? 0
  if ('generic' in patch) {
    c.size = n(c.size) + patch.size
    c.generic_land = Math.max(0, n(c.generic_land) + patch.generic)
    if (patch.sleeved) c.sleeved = Math.max(0, n(c.sleeved) + patch.generic)
    else {
      c.planned = Math.max(0, n(c.planned) + patch.generic)
      c.generic_unsleeved = Math.max(0, n(c.generic_unsleeved) + patch.generic)
    }
  } else {
    const dir = patch.unsleeveFlip === 'unsleeve' ? 1 : -1
    c.generic_unsleeved = Math.max(0, n(c.generic_unsleeved) + dir * patch.amount)
    c.sleeved = Math.max(0, n(c.sleeved) - dir * patch.amount)
    c.planned = Math.max(0, n(c.planned) + dir * patch.amount)
    const names = new Set(c.unsleevedGenericNames ?? [])
    if (dir === 1) names.add(patch.name)
    else names.delete(patch.name)
    c.unsleevedGenericNames = [...names]
  }
  return { ...old, counts: c }
}
