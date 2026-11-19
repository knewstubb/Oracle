'use client'
// Live refresh: the quiet one-line note shown after Claude changed the open deck. It fades by itself after a few seconds.
import { cn } from '@/lib/utils'
import type { LiveNote } from '@/hooks/useLiveRefresh'
export function LiveChangeNote({ note, onSeeHistory }: { note: LiveNote | null; onSeeHistory: () => void }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      {note && (
        <div
          data-testid="live-change-note"
          className={cn(
            'pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 text-[length:var(--fs-md)] shadow-md transition-opacity duration-700 motion-reduce:transition-none',
            note.fading ? 'opacity-0' : 'opacity-100',
          )}
        >
          <span>Claude just changed this deck.</span>
          <button type="button" onClick={onSeeHistory} className="min-h-11 rounded-md px-2 font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2">
            See in History
          </button>
        </div>
      )}
    </div>
  )
}
