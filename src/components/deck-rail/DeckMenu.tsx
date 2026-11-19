'use client'
import { useState } from 'react'
import { ClipboardCopy, History, MoreHorizontal, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DeleteDeckDialog } from '@/components/DeleteDeckButton'
import { exportDeckAsText } from '@/lib/deck-export'
import { FOCUS_RING } from '@/components/deck-strategy/focus'

type ExportCards = Parameters<typeof exportDeckAsText>[0]

export interface DeckMenuProps {
  deckId: number
  deckName: string
  cards: ExportCards
  onOpenHistory: () => void
}

export function DeckMenu({ deckId, deckName, cards, onOpenHistory }: DeckMenuProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const item = 'min-h-11 px-2'
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More deck actions"
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] ${FOCUS_RING}`}
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            className={item}
            onClick={() => {
              navigator.clipboard.writeText(exportDeckAsText(cards)).then(
                () => toast.success('Decklist copied to clipboard'),
                () => toast.error('Failed to copy'),
              )
            }}
          >
            <ClipboardCopy aria-hidden="true" />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem className={item} onClick={onOpenHistory}>
            <History aria-hidden="true" />
            History
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={item} variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden="true" />
            Delete deck
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDeckDialog deckId={deckId} deckName={deckName} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
