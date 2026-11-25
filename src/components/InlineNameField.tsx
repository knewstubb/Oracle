'use client'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DECK_NAME_MAX, type DeckRenameError } from '../../docs/oracle/contracts/deck-rename-and-reorder.types'
import type { RenameResult } from '@/hooks/useRenameDeck'

export interface InlineNameFieldHandle {
  /** Open the field (used by the tile's F2 key and its Rename menu item). */
  startEditing: () => void
}

interface InlineNameFieldProps {
  name: string
  /** Saves the new (trimmed) name. Resolves with the server's answer. */
  onSave: (name: string) => Promise<RenameResult>
  /** Classes for the name text itself (size, weight, colour). The text is one line, cut off with "…". */
  textClassName?: string
  /** Sideways and up/down reach of the outline and field beyond the text. */
  reach?: 'tile' | 'page'
  /** Tells the parent while a field is open so it can stop its own click (opening the deck). */
  onEditingChange?: (open: boolean) => void
}

const REFUSAL_COPY: Record<Exclude<DeckRenameError, 'save_failed' | 'not_found'>, string> = {
  name_empty: 'A deck needs a name.',
  name_taken: 'You already have a deck with that name.',
  name_too_long: `Names can be up to ${DECK_NAME_MAX} characters.`,
}

type Phase = 'idle' | 'editing' | 'saving' | 'refused'

/**
 * A deck name that renames in place (spec deck-rename-and-reorder, section 5). The text keeps its space while the
 * field is laid over it, so nothing around it moves. Enter or clicking away saves, Escape cancels. No success
 * message; failures and refusals put the old name back and say why (D-030).
 */
export const InlineNameField = forwardRef<InlineNameFieldHandle, InlineNameFieldProps>(function InlineNameField(
  { name, onSave, textClassName, reach = 'tile', onEditingChange },
  ref
) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [draft, setDraft] = useState(name)
  const phaseRef = useRef<Phase>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)

  const move = useCallback(
    (next: Phase) => {
      phaseRef.current = next
      setPhase(next)
      onEditingChange?.(next !== 'idle')
    },
    [onEditingChange]
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const startEditing = useCallback(
    (text?: string) => {
      if (phaseRef.current !== 'idle') return
      setDraft(text ?? name)
      move('editing')
    },
    [move, name]
  )

  useImperativeHandle(ref, () => ({ startEditing: () => startEditing() }), [startEditing])

  // Select the whole name when the field opens.
  useEffect(() => {
    if (phase === 'editing') inputRef.current?.select()
  }, [phase])

  const refuse = (message: string, retry?: string) => {
    move('refused')
    toast.error(message, retry === undefined ? undefined : { action: { label: 'Try again', onClick: () => startEditing(retry) } })
    timer.current = setTimeout(() => {
      if (mounted.current) move('idle')
    }, 450)
  }

  const commit = async () => {
    if (phaseRef.current !== 'editing') return
    const typed = draft.trim()
    if (typed === name.trim()) return move('idle')
    if (typed.length === 0) return refuse(REFUSAL_COPY.name_empty)
    move('saving')
    const result = await onSave(typed)
    if (!mounted.current) return
    if (result.ok) return move('idle')
    if (result.error === 'save_failed' || result.error === 'not_found') {
      return refuse(`Couldn't rename ${name}. It still has its old name.`, typed)
    }
    refuse(REFUSAL_COPY[result.error])
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value
    if (value.length > DECK_NAME_MAX) {
      value = value.slice(0, DECK_NAME_MAX)
      toast.info(REFUSAL_COPY.name_too_long, { id: 'deck-name-too-long' })
    }
    setDraft(value)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (phaseRef.current === 'editing') move('idle')
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void commit()
    }
  }

  const open = phase !== 'idle'
  const reachClass = reach === 'tile' ? '-inset-x-1.5 inset-y-0' : '-inset-x-1.5 -inset-y-0.5'

  return (
    // On the tile the 18px line gets 3px of invisible padding above and below, so a tap target is at least 24px.
    <span
      className={cn('relative z-[2] block min-w-0', reach === 'tile' && '-my-[3px] py-[3px]')}
      onClick={open ? undefined : () => startEditing()}
    >
      {/* The name keeps its space (hidden) while the field is open, so nothing reflows. */}
      <button
        type="button"
        title="Rename"
        aria-label={`Rename ${name}`}
        tabIndex={open ? -1 : 0}
        className={cn(
          'peer relative block w-full cursor-text truncate rounded-sm border-0 bg-transparent p-0 text-left',
          'focus-visible:outline-none',
          open && 'invisible',
          textClassName
        )}
      >
        {name}
      </button>
      {/* Quiet outline around the name on hover or keyboard focus. It sits outside the text, so nothing moves. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute rounded-md border border-transparent transition-colors',
          reachClass,
          'peer-hover:border-[var(--border-subtle)] peer-hover:bg-white/5',
          'peer-focus-visible:border-[var(--border-subtle)] peer-focus-visible:bg-white/5 peer-focus-visible:ring-2 peer-focus-visible:ring-primary',
          open && 'hidden'
        )}
      />
      {open && (
        <>
          <Input
            ref={inputRef}
            aria-label="Deck name"
            aria-invalid={phase === 'refused' || undefined}
            value={draft}
            readOnly={phase !== 'editing'}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onBlur={() => void commit()}
            className={cn(
              'absolute h-auto w-[calc(100%+12px)] rounded-md border px-[5px] py-0 leading-[inherit] shadow-none md:text-[length:inherit]',
              reachClass,
              'border-[var(--accent-primary-text)] bg-[var(--bg-canvas)] ring-0 focus-visible:ring-[3px] focus-visible:ring-[var(--accent-primary-border)]',
              phase === 'saving' && 'border-[var(--border-subtle)] pr-7 text-[var(--text-muted,#808080)]',
              phase === 'refused' && 'border-[var(--signal-error)] text-[var(--signal-error)]',
              textClassName
            )}
          />
          {phase === 'saving' && (
            <span role="status" aria-label="Saving" className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2">
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
            </span>
          )}
        </>
      )}
    </span>
  )
})
