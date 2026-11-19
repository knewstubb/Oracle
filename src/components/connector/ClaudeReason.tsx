// The one line Claude gave for a change (DV-04). Shows nothing when there is none, so older changes look exactly as before.
// It is never the approval-hold reason (why a change is waiting): that stays in the "Big edit · waiting" tag.
export function ClaudeReason({ reason, className = '' }: { reason?: string | null; className?: string }) {
  const text = reason?.trim()
  if (!text) return null
  return (
    <p data-testid="claude-reason" className={`text-[length:var(--fs-sm)] text-[var(--text-primary)] ${className}`}>
      <span className="font-medium">Reason:</span> {text}
    </p>
  )
}
