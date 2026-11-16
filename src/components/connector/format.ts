// Time wording for the connector screens. Pure and testable; no hidden "now".
const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, TIME)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function formatDateTime(iso: string | null | undefined): string {
  return `${formatDate(iso)}, ${formatClock(iso)}`
}

export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** "Today", "Yesterday", or "Sat 14 Nov". */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (dayKey(iso) === dayKey(now.toISOString())) return 'Today'
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (dayKey(iso) === dayKey(y.toISOString())) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
