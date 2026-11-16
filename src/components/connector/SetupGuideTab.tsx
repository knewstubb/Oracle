'use client'

export function SetupGuideTab() {
  return (
    <section
      aria-labelledby="guide-h"
      className="rounded-lg border border-[var(--border-subtle)] p-6 text-center"
      data-testid="setup-guide-stub"
    >
      <h3 id="guide-h" className="text-[length:var(--fs-lg)] font-medium text-[var(--text-primary)]">Setup guide: coming next</h3>
      <p className="mt-1 text-[length:var(--fs-sm)] text-[var(--text-secondary)]">
        Step-by-step help for connecting Claude on the web, desktop and phone is coming next. Until then, look for
        &quot;connectors&quot; in Claude&apos;s settings.
      </p>
    </section>
  )
}
