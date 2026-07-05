'use client'

export interface DraftBannerProps {
  deckId: number
  onContinue: (id: number) => void
  onDelete: (id: number) => void
}

/**
 * Persistent banner displayed between the health strip and tabs on a draft-status
 * deck detail page. Shows "Continue brewing" and "Delete draft" actions.
 *
 * The parent component is responsible for only rendering this when deck status is 'draft'.
 *
 * Validates: Requirements 10.5
 */
export function DraftBanner({ deckId, onContinue, onDelete }: DraftBannerProps) {
  return (
    <div
      className="w-full px-4 py-2 bg-blue-500/5 border border-blue-400/20"
      role="status"
      aria-label="Draft deck banner"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          This deck is a draft
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onContinue(deckId)}
            className="rounded-md px-3 py-1 text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-400/30 hover:bg-blue-500/20 transition-colors"
          >
            Continue brewing
          </button>
          <button
            type="button"
            onClick={() => onDelete(deckId)}
            className="rounded-md px-3 py-1 text-xs font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Delete draft
          </button>
        </div>
      </div>
    </div>
  )
}
