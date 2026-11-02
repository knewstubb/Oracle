'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Download, Loader2, RefreshCw, Search } from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { parseDeckUrl, isParseError } from '@/lib/url-parser'
import { FORMAT_OPTIONS } from '@/lib/format-config'
import type { NormalizedDeck, CardsByType } from '@/lib/deck-normalizer'
import type { ImportMode, AllocationConflict } from '@/lib/deck-import'
import { ImportIntentChoice } from '@/components/manabox-import/ImportIntentChoice'
import { ManaBoxDeckImportFlow, type DeckFlowState } from '@/components/manabox-import/ManaBoxDeckImportFlow'
import { ImportTitleIcon } from '@/components/manabox-import/ImportTitleIcon'
import { ImportDiscardDialog } from '@/components/manabox-import/ImportDiscardDialog'
import { IMPORT_MODAL_CLASS, IMPORT_INTERACTIVE_CLASS } from '@/components/manabox-import/import-labels'
import { decideDeckDialogClose } from '@/components/manabox-import/import-close-guard'
import { intentHeading, PRECONS_NOT_SET_UP, PRECONS_NOT_SET_UP_HINT, PRECON_OPEN_FAILED, URL_HELP_TITLE, URL_HELP_EXAMPLES, URL_HELP_NOTE } from '@/components/manabox-import/import-copy'
import { deckToCsv, deckCsvFileName } from '@/lib/deck-to-csv'
import { preconCardsToCsv, preconCommanderName, preconFileName, type PreconDetail, type PreconListItem } from '@/lib/precons'
import type { ImportIntent } from '../../docs/oracle/contracts/import-intent.types'

const INTENT_URL_MODE: Record<ImportIntent, ImportMode> = {
  purchased: 'new_cards',
  built: 'built',
  planned: 'theorycrafted',
}

type InputTab = 'url' | 'paste' | 'file' | 'precon'

type Precon = PreconListItem

interface DeckImportButtonProps {
  className?: string
  onPreviewSuccess?: (deck: NormalizedDeck, cardsByType: CardsByType) => void
  variant?: 'default' | 'secondary'
}

interface PreviewResponse {
  deck: NormalizedDeck
  cardsByType: CardsByType
}

interface ImportResponse {
  deckId: number
  allocationSummary: {
    assigned: number
    shortfall: number
    errors: string[]
    conflicts: AllocationConflict[]
  }
}

/** HTTP status codes that indicate transient/retryable failures */
const RETRYABLE_STATUSES = new Set([502, 504])

function getDisplayError(status: number, serverMessage: string): string {
  switch (status) {
    case 400:
      return serverMessage || "We can't read that link. Check it's a link to a deck on one of the supported sites listed below."
    case 403:
      return 'This deck is private and cannot be imported. Make it public first.'
    case 404:
      return serverMessage || 'Deck not found.'
    case 504:
      return 'Request timed out. The platform may be experiencing issues.'
    case 502:
      return serverMessage || 'Failed to fetch deck. The platform may be temporarily unavailable.'
    default:
      return serverMessage || 'Something went wrong. Please try again.'
  }
}

const NO_FLOW_STATE: DeckFlowState = { checking: false, saving: false, hasEdits: false, reviewing: false, done: false, choosing: false }

export function DeckImportButton({
  className,
  onPreviewSuccess,
  variant = 'default',
}: DeckImportButtonProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<InputTab>('url')

  // URL tab state
  const [url, setUrl] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [lastErrorStatus, setLastErrorStatus] = useState<number | null>(null)
  const lastSubmittedUrl = useRef<string>('')

  // Paste tab state
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  // The pasted list, handed to the same check-and-review screen a file gets.
  const [pastedFile, setPastedFile] = useState<File | null>(null)

  // Precon tab state
  const [preconSearch, setPreconSearch] = useState('')
  const [debouncedPreconSearch, setDebouncedPreconSearch] = useState('')
  const [preconError, setPreconError] = useState<string | null>(null)
  // A precon the owner picked: its card list goes to the same review as a file (all purchased).
  const [preconPick, setPreconPick] = useState<{ name: string; commander: string | null } | null>(null)
  const [preconOpeningId, setPreconOpeningId] = useState<string | null>(null)
  const [preconsNotSetUp, setPreconsNotSetUp] = useState(false)
  // A deck fetched from a link, reviewed like a file.
  const [linkPick, setLinkPick] = useState<{ commander: string | null } | null>(null)
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('new_cards')
  const [importFormat, setImportFormat] = useState<string>('commander')
  // First screen: what the deck is. Nothing is pre-selected.
  const [intent, setIntent] = useState<ImportIntent | null>(null)

  const router = useRouter()
  const queryClient = useQueryClient()

  const resetState = useCallback(() => {
    setUrl('')
    setValidationError(null)
    setLastErrorStatus(null)
    setPasteText('')
    setPasteError(null)
    setPastedFile(null)
    setPreviewData(null)
    setPreconSearch('')
    setDebouncedPreconSearch('')
    setPreconError(null)
    setPreconPick(null)
    setPreconOpeningId(null)
    setPreconsNotSetUp(false)
    setLinkPick(null)
    setImportMode('new_cards')
    setImportFormat('commander')
  }, [])

  // Debounce precon search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPreconSearch(preconSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [preconSearch])

  // Fetch precons
  const { data: preconsData, isLoading: preconsLoading } = useQuery({
    queryKey: ['precons', debouncedPreconSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '300' })
      if (debouncedPreconSearch) params.set('q', debouncedPreconSearch)
      const res = await fetch(`/api/precons?${params}`)
      if (!res.ok) throw new Error('Failed to fetch precons')
      const data = (await res.json()) as { precons: Precon[]; setup?: boolean }
      return { precons: data.precons ?? [], setup: data.setup !== false }
    },
    enabled: activeTab === 'precon',
    staleTime: 60_000,
  })

  // --- URL preview mutation ---
  const previewMutation = useMutation({
    mutationFn: async (deckUrl: string): Promise<PreviewResponse> => {
      lastSubmittedUrl.current = deckUrl
      const res = await fetch('/api/decks/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: deckUrl }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Failed to fetch deck' }))
        const errorMsg = getDisplayError(res.status, body.error)
        setLastErrorStatus(res.status)
        throw new Error(errorMsg)
      }

      setLastErrorStatus(null)
      return res.json()
    },
    onSuccess: (data) => {
      if (onPreviewSuccess) {
        setOpen(false)
        resetState()
        onPreviewSuccess(data.deck, data.cardsByType)
      } else {
        // A link goes to the same review as a file, using the intent chosen on the first screen.
        setLinkPick({ commander: null })
        setPastedFile(new File([deckToCsv(data.deck)], deckCsvFileName(data.deck.name), { type: 'text/csv' }))
        setActiveTab('file')
      }
    },
  })

  // --- Import mutation (used for all paths in the confirmation step) ---
  const importMutation = useMutation({
    mutationFn: async ({ deck, mode, format }: { deck: NormalizedDeck; mode: ImportMode; format: string }): Promise<ImportResponse> => {
      const res = await fetch('/api/decks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deck, mode, format }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Deck import failed' }))
        throw new Error(body.error ?? 'Deck import failed')
      }

      return res.json()
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })

      if (data.allocationSummary.errors.length > 0) {
        toast.warning('Deck imported with allocation warnings', {
          description: data.allocationSummary.errors.join('; '),
        })
      } else {
        toast.success('Deck imported successfully')
      }

      // A commander deck with no commander from the source: the deck page prompts for one.
      const needsCommander = variables.format === 'commander' && !variables.deck.commander
      setOpen(false)
      resetState()
      router.push(`/decks/${data.deckId}?freshImport=true${needsCommander ? '&pickCommander=true' : ''}`)
    },
  })

  const isRetryable = lastErrorStatus !== null && RETRYABLE_STATUSES.has(lastErrorStatus)

  // --- Handlers ---

  function handleUrlSubmit() {
    setValidationError(null)
    setLastErrorStatus(null)

    const trimmed = url.trim()
    if (!trimmed) {
      setValidationError('Please enter a deck URL')
      return
    }

    const parseResult = parseDeckUrl(trimmed)
    if (isParseError(parseResult)) {
      setValidationError(
        "We can't read that link. Check it's a link to a deck on one of the supported sites listed below."
      )
      return
    }

    if (intent) setImportMode(INTENT_URL_MODE[intent])
    previewMutation.mutate(trimmed)
  }

  function handleRetry() {
    if (lastSubmittedUrl.current) {
      setLastErrorStatus(null)
      previewMutation.mutate(lastSubmittedUrl.current)
    }
  }

  function handlePasteSubmit() {
    setPasteError(null)

    const trimmed = pasteText.trim()
    if (!trimmed) {
      setPasteError('Please paste a decklist')
      return
    }

    // A pasted list takes the same path as an uploaded text file: names are looked up,
    // the owner reviews the cards, then the deck is created.
    setPastedFile(new File([trimmed], 'Imported Deck.txt', { type: 'text/plain' }))
    setActiveTab('file')
  }

  /** Open a precon in the same review as a file: all purchased, exact printings. */
  async function handlePreconPick(precon: Precon) {
    if (preconOpeningId) return
    setPreconError(null)
    setPreconOpeningId(precon.id)
    try {
      const res = await fetch(`/api/precons/${precon.id}`)
      if (res.status === 503) {
        setPreconsNotSetUp(true)
        return
      }
      if (!res.ok) throw new Error('open failed')
      const { precon: detail } = (await res.json()) as { precon: PreconDetail }
      if (!detail.cards?.length) {
        setPreconsNotSetUp(true)
        return
      }
      const csv = preconCardsToCsv(detail.cards)
      setPreconPick({ name: detail.name, commander: preconCommanderName(detail.cards, detail.commander_name) })
      setPastedFile(new File([csv], preconFileName(detail.name), { type: 'text/csv' }))
      setActiveTab('file')
    } catch {
      setPreconError(PRECON_OPEN_FAILED)
    } finally {
      setPreconOpeningId(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (activeTab === 'url') handleUrlSubmit()
      else if (activeTab === 'paste') handlePasteSubmit()
    }
  }

  function handleConfirmImport() {
    if (!previewData) return
    importMutation.mutate({
      deck: previewData.deck,
      mode: importMode,
      format: importFormat,
    })
  }

  const [flowState, setFlowState] = useState<DeckFlowState>(NO_FLOW_STATE)
  const onFlowState = useCallback((state: DeckFlowState) => setFlowState(state), [])
  const fileTab = activeTab === 'file' && !previewData
  // The app's own "Discard edits?" dialog; holds what to do if the owner confirms.
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null)

  /** Run `action`, but ask first if the review list has edits. */
  function askBeforeDiscard(action: () => void) {
    if (fileTab && flowState.hasEdits) setDiscardAction(() => action)
    else action()
  }

  function closeDialog() {
    setOpen(false)
    resetState()
    setActiveTab('url')
    setIntent(null)
    setFlowState(NO_FLOW_STATE)
    previewMutation.reset()
    importMutation.reset()
  }

  function handleOpenChange(nextOpen: boolean, details?: { reason?: string; cancel?: () => void }) {
    if (nextOpen) return setOpen(true)
    if (fileTab) {
      const decision = decideDeckDialogClose(details?.reason, flowState)
      if (decision === 'block') return details?.cancel?.()
      if (decision === 'confirm') {
        setDiscardAction(() => closeDialog)
        return details?.cancel?.()
      }
    }
    closeDialog()
  }

  // Tabs and the choices stay put while a file is read; only the review, saving and done screens replace them.
  const sourceChosen = fileTab && (flowState.reviewing || flowState.saving || flowState.done)

  const urlDisplayError = validationError ?? (previewMutation.isError ? previewMutation.error.message : null)
  // While "What's this deck?" is asked, the tab the deck came from stays highlighted.
  const originTab: InputTab = preconPick ? 'precon' : linkPick ? 'url' : pastedFile ? 'paste' : 'file'
  const shownTab: InputTab = fileTab && (flowState.choosing || flowState.checking) ? originTab : activeTab

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button 
            className={className ?? ''} 
            variant={variant === 'secondary' ? 'outline' : 'default'}
          />
        }
      >
        <Download className="size-4" aria-hidden="true" />
        Import deck
      </DialogTrigger>

      <DialogContent
        className={previewData ? `${IMPORT_INTERACTIVE_CLASS} sm:max-w-2xl` : IMPORT_MODAL_CLASS}
        showCloseButton={!(flowState.saving || importMutation.isPending)}
      >
        {previewData ? (
          <>
            <DialogHeader>
              <DialogTitle>Import &ldquo;{previewData.deck.name}&rdquo;</DialogTitle>
              <DialogDescription>
                {previewData.deck.cardCount} cards · {previewData.deck.commander?.cardName ?? 'No commander'} · {previewData.deck.colourIdentity || 'Colorless'}
              </DialogDescription>
            </DialogHeader>

            {/* Mode picker */}
            <div className="flex flex-col gap-3">
              <p className="text-[length:var(--fs-sm)] text-muted-foreground">
                How should we handle these cards?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-4 py-3 text-left transition-colors hover:bg-[var(--bg-surface-hover)] hover:border-[var(--text-secondary)]"
                  style={importMode === 'new_cards'
                    ? { borderColor: 'var(--accent-primary)', background: 'var(--accent-primary-bg)' }
                    : { borderColor: 'var(--border-default)' }
                  }
                  onClick={() => setImportMode('new_cards')}
                >
                  <span className="block text-[length:var(--fs-md)] font-medium">These are new cards</span>
                  <span className="block text-[length:var(--fs-sm)] text-muted-foreground">
                    Add to my collection and assign to deck slots
                  </span>
                </button>
                <button
                  type="button"
                  className="rounded-lg border px-4 py-3 text-left transition-colors hover:bg-[var(--bg-surface-hover)] hover:border-[var(--text-secondary)]"
                  style={importMode === 'built'
                    ? { borderColor: 'var(--accent-primary)', background: 'var(--accent-primary-bg)' }
                    : { borderColor: 'var(--border-default)' }
                  }
                  onClick={() => setImportMode('built')}
                >
                  <span className="block text-[length:var(--fs-md)] font-medium">I have this deck built</span>
                  <span className="block text-[length:var(--fs-sm)] text-muted-foreground">
                    Sleeve cards from my existing collection automatically
                  </span>
                </button>
                <button
                  type="button"
                  className="rounded-lg border px-4 py-3 text-left transition-colors hover:bg-[var(--bg-surface-hover)] hover:border-[var(--text-secondary)]"
                  style={importMode === 'theorycrafted'
                    ? { borderColor: 'var(--accent-primary)', background: 'var(--accent-primary-bg)' }
                    : { borderColor: 'var(--border-default)' }
                  }
                  onClick={() => setImportMode('theorycrafted')}
                >
                  <span className="block text-[length:var(--fs-md)] font-medium">This is theorycrafted</span>
                  <span className="block text-[length:var(--fs-sm)] text-muted-foreground">
                    Save the decklist as Planned, with no physical allocation
                  </span>
                </button>
              </div>
            </div>

            {/* Format selector */}
            <div className="flex flex-col gap-2">
              <p className="text-[length:var(--fs-sm)] text-muted-foreground">
                Format
              </p>
              <select
                value={importFormat}
                onChange={(e) => setImportFormat(e.target.value)}
                className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-[length:var(--fs-md)] text-[var(--text-primary)] outline-none"
              >
                {FORMAT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPreviewData(null)}
                disabled={importMutation.isPending}
              >
                Back
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" data-icon="inline-start" />
                )}
                {importMutation.isPending ? 'Importing...' : 'Import deck'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                <ImportTitleIcon kind="deck" />
                {intentHeading(intent)}
              </DialogTitle>
              {/* The "how" subtitle only helps on the source-choice screen. */}
              {!sourceChosen && (
                <DialogDescription>
                  Import a deck from a URL, paste a decklist, or upload a CSV file.
                </DialogDescription>
              )}
            </DialogHeader>

            {/* Input mode tabs: not useful once cards are being reviewed or saved */}
            {!sourceChosen && (
            <div className="flex gap-1 rounded-md p-0.5" style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)' }}>
              {(['url', 'paste', 'file', 'precon'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className="flex-1 rounded px-3 py-1.5 text-[length:var(--fs-sm)] font-medium transition-colors hover:bg-white/10 hover:text-foreground disabled:hover:bg-transparent"
                  style={shownTab === tab
                    ? { background: 'var(--accent-primary)', color: 'white' }
                    : { color: 'var(--text-tertiary)' }
                  }
                  disabled={flowState.saving || flowState.checking}
                  onClick={() => {
                    if (tab !== shownTab || tab !== activeTab) askBeforeDiscard(() => { setPastedFile(null); setPreconPick(null); setLinkPick(null); setIntent(null); setActiveTab(tab) })
                  }}
                >
                  {tab === 'url' ? 'URL' : tab === 'paste' ? 'Text list' : tab === 'file' ? 'File upload' : 'Precon'}
                </button>
              ))}
            </div>
            )}

            {/* Tab content: same height on every tab, so the window never changes size */}
            <div className={activeTab === 'precon' ? 'min-h-0 flex-1 overflow-y-auto' : 'flex min-h-0 flex-1 flex-col'}>
              {/* URL tab: centred in the fixed body, with the sites it accepts */}
              {activeTab === 'url' && (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto">
                <div className="flex w-full max-w-md flex-col gap-3">
                <div className="flex gap-2">
                <Input className="flex-1"
                  type="url"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    if (validationError) setValidationError(null)
                    if (previewMutation.isError) previewMutation.reset()
                    setLastErrorStatus(null)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="https://archidekt.com/decks/..."
                  disabled={previewMutation.isPending}
                  aria-invalid={!!urlDisplayError}
                  autoFocus
                />
                <Button onClick={handleUrlSubmit} disabled={previewMutation.isPending || !url.trim()}>
                  {previewMutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" data-icon="inline-start" />}
                  {previewMutation.isPending ? 'Fetching...' : 'Fetch Deck'}
                </Button>
                </div>

                {urlDisplayError && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2" role="alert">
                    <p className="flex-1 text-[length:var(--fs-md)] text-destructive">{urlDisplayError}</p>
                    {isRetryable && !previewMutation.isPending && (
                      <Button variant="ghost" size="sm" className="h-auto shrink-0 px-2 py-0.5 text-destructive" onClick={handleRetry}>
                        <RefreshCw className="size-3" aria-hidden="true" /> Try Again
                      </Button>
                    )}
                  </div>
                )}
                </div>
                <div className="w-full max-w-md rounded-[10px] border border-[var(--border-subtle)] px-3 py-2.5 text-[length:var(--fs-xs)] text-muted-foreground">
                  <p className="mb-1 font-medium text-foreground">{URL_HELP_TITLE}</p>
                  <ul className="flex flex-col gap-0.5">
                    {URL_HELP_EXAMPLES.map((ex) => (
                      <li key={ex.site}>
                        <span className="text-foreground">{ex.site}</span>{' '}
                        <code className="font-mono">{ex.example}</code>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1">{URL_HELP_NOTE}</p>
                </div>
              </div>
            )}

            {/* Paste tab: the text box fills the rest of the window */}
            {activeTab === 'paste' && (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <textarea
                  value={pasteText}
                  onChange={(e) => { setPasteText(e.target.value); setPasteError(null) }}
                  onKeyDown={handleKeyDown}
                  placeholder={"1 Sol Ring\n1 Command Tower\n1 Arcane Signet\n..."}
                  disabled={importMutation.isPending}
                  className="min-h-0 w-full flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[length:var(--fs-sm)] text-foreground placeholder:text-muted-foreground focus:border-[var(--accent-primary)] focus:outline-none resize-none font-mono"
                />

                {pasteError && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2" role="alert">
                    <p className="text-[length:var(--fs-md)] text-destructive">{pasteError}</p>
                  </div>
                )}
              </div>
            )}

            {/* File tab */}
            {activeTab === 'file' && (
              <ManaBoxDeckImportFlow
                fill
                initialFile={pastedFile}
                intent={intent}
                onIntentChange={setIntent}
                initialCommanderName={preconPick?.commander ?? null}
                precon={preconPick !== null}
                onStateChange={onFlowState}
                onComplete={(_deckId, _format, _deckName, summary) => {
                  try {
                    sessionStorage.setItem('manabox-import-summary', JSON.stringify(summary))
                  } catch {
                    // ignore storage errors
                  }
                }}
                onClose={closeDialog}
                onFinish={(deckId) => {
                  closeDialog()
                  router.push(`/decks/${deckId}?freshImport=true&pickCommander=true`)
                }}
                onCancel={() => {
                  askBeforeDiscard(() => {
                    setActiveTab(preconPick ? 'precon' : linkPick ? 'url' : pastedFile ? 'paste' : 'url')
                    setPastedFile(null)
                    setPreconPick(null)
                    setLinkPick(null)
                    setIntent(null)
                  })
                }}
              />
            )}

            {/* Precon tab */}
            {activeTab === 'precon' && (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={preconSearch}
                    onChange={(e) => setPreconSearch(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search precons..."
                    className="pl-9"
                    disabled={!!preconOpeningId}
                    autoFocus
                  />
                </div>

                {/* Precon list */}
                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--border-default)]">
                  {preconsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : preconsNotSetUp || (preconsData && !preconsData.setup) ? (
                    <div className="px-4 py-8 text-center" role="status">
                      <p className="text-[length:var(--fs-md)] font-medium">{PRECONS_NOT_SET_UP}</p>
                      <p className="mt-1 text-[length:var(--fs-sm)] text-muted-foreground">{PRECONS_NOT_SET_UP_HINT}</p>
                    </div>
                  ) : !preconsData?.precons.length ? (
                    <div className="py-8 text-center text-[length:var(--fs-sm)] text-muted-foreground">
                      {debouncedPreconSearch ? 'No precons found' : 'Loading precons...'}
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border-default)]">
                      {preconsData.precons.map((precon) => (
                        <button
                          key={precon.id}
                          type="button"
                          className="w-full px-3 py-3 text-left transition-colors hover:bg-[var(--bg-surface-hover)] disabled:opacity-60"
                          disabled={!!preconOpeningId}
                          aria-busy={preconOpeningId === precon.id}
                          onClick={() => void handlePreconPick(precon)}
                        >
                          <div className="flex items-center gap-3">
                            {/* Commander art crop */}
                            <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded bg-[var(--bg-surface)]">
                              {precon.commander_image ? (
                                <img
                                  src={precon.commander_image}
                                  alt={precon.commander_name || 'Commander'}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[length:var(--fs-xs)] text-muted-foreground">
                                  ?
                                </div>
                              )}
                            </div>
                            {/* Precon info */}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[length:var(--fs-md)] font-medium">
                                {precon.name}
                              </p>
                              <p className="truncate text-[length:var(--fs-sm)] text-muted-foreground">
                                {precon.commander_name || 'Unknown commander'}
                              </p>
                              <p className="truncate text-[length:var(--fs-xs)] text-muted-foreground">
                                {precon.set_name} · {precon.release_date ? new Date(precon.release_date).getFullYear() : ''}
                              </p>
                            </div>
                            {/* Color identity - MTG mana pips; colourless decks show the colourless symbol */}
                            {(
                              <span className="flex shrink-0 items-center gap-0.5">
                                {['W', 'U', 'B', 'R', 'G'].every(c => !(precon.color_identity ?? '').includes(c)) && (
                                  <i className="ms ms-c ms-cost ms-shadow" style={{ fontSize: '16px' }} aria-label="Colorless" />
                                )}
                                {['W', 'U', 'B', 'R', 'G']
                                  .filter(c => (precon.color_identity ?? '').includes(c))
                                  .map(c => (
                                    <i
                                      key={c}
                                      className={`ms ms-${c.toLowerCase()} ms-cost ms-shadow`}
                                      style={{ fontSize: '16px' }}
                                      aria-label={c === 'W' ? 'White' : c === 'U' ? 'Blue' : c === 'B' ? 'Black' : c === 'R' ? 'Red' : 'Green'}
                                    />
                                  ))
                                }
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {preconOpeningId && (
                  <p className="flex items-center gap-2 text-[length:var(--fs-sm)] text-muted-foreground" role="status">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Opening the precon…
                  </p>
                )}

                {preconError && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2" role="alert">
                    <p className="text-[length:var(--fs-md)] text-destructive">{preconError}</p>
                  </div>
                )}
              </div>
            )}
            </div>

            {/* Same place as on the File tab: greyed out until the deck has loaded. */}
            {activeTab !== 'file' && <ImportIntentChoice value={null} onChange={() => {}} disabled />}

            {!fileTab && (
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handlePasteSubmit}
                disabled={activeTab !== 'paste' || !pasteText.trim()}
              >
                Continue
              </Button>
            </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
      <ImportDiscardDialog
        open={discardAction !== null}
        onKeepEditing={() => setDiscardAction(null)}
        onDiscard={() => {
          const action = discardAction
          setDiscardAction(null)
          action?.()
        }}
      />
    </Dialog>
  )
}
