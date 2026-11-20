'use client'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CardImage } from '@/components/CardImage'
import { ManaCost } from '@/components/ManaCost'

export type Context = 'deck' | 'collection'
export type TabId = 'overview' | 'printings' | 'copies' | 'rulings'

/** The last tab used in each context, kept for the browser session. */
const lastTab: Partial<Record<Context, TabId>> = {}
/** For tests: forget the remembered tabs. */
export function resetCardDetailsTabMemory() {
  delete lastTab.deck
  delete lastTab.collection
}

/** The tab to show and a setter that also remembers the choice for this context. */
export function useRememberedTab(context: Context, allowed: readonly TabId[] = ['overview', 'printings', 'copies', 'rulings']) {
  const remembered = lastTab[context]
  const [tab, setTabState] = useState<TabId>(remembered && allowed.includes(remembered) ? remembered : 'overview')
  const setTab = (t: TabId) => { lastTab[context] = t; setTabState(t) }
  return [tab, setTab] as const
}

export interface ShellTab {
  id: TabId
  label: string
  count: number | null
}

export interface CardDetailsShellProps {
  name: string
  manaCost: string | null | undefined
  subline: string
  description: string
  imageId: string | null
  /** Under the picture: the badge or pill and the key/value list. */
  railExtras: ReactNode
  /** Buttons placed before the close button. */
  actions: ReactNode
  /** Shown under the header (an error line, for example). */
  notice?: ReactNode
  tabs: ShellTab[]
  tab: TabId
  onTab: (t: TabId) => void
  status: 'loading' | 'error' | 'ready'
  onRetry: () => void
  /** Replaces the tabs and body (the deck window uses it when the card has left the deck). */
  override?: ReactNode
  /** The tab content when ready. */
  children: ReactNode
  onClose: () => void
  /** Called by the deck window to let its parent clear a pending preview when the dialog closes. */
  testId?: string
}

export function CardDetailsShell({
  name, manaCost, subline, description, imageId, railExtras, actions, notice, tabs, tab, onTab, status, onRetry, override, children, onClose,
}: CardDetailsShellProps) {
  const uid = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === tab)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else return
    e.preventDefault()
    onTab(tabs[next].id)
    document.getElementById(`${uid}-tab-${tabs[next].id}`)?.focus()
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        showCloseButton={false}
        initialFocus={closeRef}
        data-testid="card-details"
        className="flex flex-col gap-0 overflow-hidden p-0 max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:grid sm:h-[min(600px,calc(100dvh-2rem))] sm:w-[min(1080px,calc(100vw-2rem))] sm:max-w-none sm:grid-cols-[252px_minmax(0,1fr)]"
      >
        {/* Rail: a column on desktop, a header strip on a phone */}
        <aside className="flex shrink-0 items-center gap-3 border-b border-[var(--border-default)] p-3 sm:flex-col sm:items-stretch sm:gap-4 sm:overflow-auto sm:border-r sm:border-b-0 sm:p-5" data-testid="card-details-rail">
          <div className="w-16 shrink-0 overflow-hidden sm:mx-auto sm:w-[212px] [&_[role=img]]:!h-auto [&_[role=img]]:!w-full [&_[role=img]]:aspect-[5/7]">
            <CardImage scryfallId={imageId} alt={name} width={212} height={296} noPreview className="aspect-[5/7] w-full rounded-lg" />
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:gap-3">{railExtras}</div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-start gap-2 px-4 pt-4 max-sm:px-3 max-sm:pt-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <DialogTitle className="truncate text-[length:var(--fs-xl)] font-semibold">{name}</DialogTitle>
                {manaCost && <ManaCost cost={manaCost} />}
              </div>
              {subline && <p className="mt-0.5 text-[length:var(--fs-sm)] text-muted-foreground">{subline}</p>}
            </div>
            {actions}
            <DialogClose ref={closeRef} render={<Button variant="outline" size="icon" className="max-sm:size-11" aria-label="Close card details" />}>
              <span aria-hidden="true">✕</span>
            </DialogClose>
          </header>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          {notice}
          {override ?? (
            <>
              <div role="tablist" aria-label="Card details" onKeyDown={onTabKey} className="mt-3 flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border-default)] px-4 max-sm:px-3">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    id={`${uid}-tab-${t.id}`}
                    role="tab"
                    type="button"
                    aria-selected={tab === t.id}
                    aria-controls={`${uid}-panel-${t.id}`}
                    tabIndex={tab === t.id ? 0 : -1}
                    onClick={() => onTab(t.id)}
                    className={`shrink-0 border-b-2 px-3 py-2 text-[length:var(--fs-sm)] max-sm:min-h-11 ${tab === t.id ? 'border-[var(--text-primary)] font-medium' : 'border-transparent text-muted-foreground'}`}
                  >
                    {t.label}
                    {t.count != null && <span className="ml-1 text-[length:var(--fs-xs)] text-muted-foreground">{t.count}</span>}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id={`${uid}-panel-${tab}`}
                aria-labelledby={`${uid}-tab-${tab}`}
                className="flex min-h-0 flex-1 flex-col"
                data-testid={`card-details-panel-${tab}`}
              >
                {status === 'loading' ? (
                  <div role="status" className="p-4">
                    <span className="sr-only">Loading details for {name}</span>
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : status === 'error' ? (
                  <p className="p-4 text-[length:var(--fs-sm)]">
                    Couldn&apos;t load details for {name}. Nothing has changed.
                    <Button variant="link" size="sm" className="ml-2 max-sm:h-11" onClick={onRetry}>Try again</Button>
                  </p>
                ) : children}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
