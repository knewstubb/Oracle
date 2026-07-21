'use client'

import { useState, useCallback, useRef } from 'react'
import { Download, Loader2, RefreshCw, Upload } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { parseDeckCSV, isCSVParseError } from '@/lib/csv-deck-parser'
import { parseTextDecklist, isTextParseError } from '@/lib/text-deck-parser'
import { FORMAT_OPTIONS } from '@/lib/format-config'
import type { NormalizedDeck, CardsByType } from '@/lib/deck-normalizer'
import type { ImportMode } from '@/lib/deck-import'

type InputTab = 'url' | 'paste' | 'csv'

interface DeckImportButtonProps {
  className?: string
  onPreviewSuccess?: (deck: NormalizedDeck, cardsByType: CardsByType) => void
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
  }
}

/** HTTP status codes that indicate transient/retryable failures */
const RETRYABLE_STATUSES = new Set([502, 504])

function getDisplayError(status: number, serverMessage: string): string {
  switch (status) {
    case 400:
      return serverMessage || "This URL format isn't supported. We support Archidekt and Moxfield deck URLs."
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

export function DeckImportButton({
  className,
  onPreviewSuccess,
}: DeckImportButtonProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<InputTab>('url')

  // URL tab state
  const [url, setUrl] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [lastErrorStatus, setLastErrorStatus] = useState<number | null>(null)
  const lastSubmittedUrl = useRef<string>('')

  // CSV tab state
  const [deckName, setDeckName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  // Paste tab state
  const [pasteText, setPasteText] = useState('')
  const [pasteDeckName, setPasteDeckName] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)

  // Confirmation step state
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('add_new_cards')
  const [importFormat, setImportFormat] = useState<string>('commander')

  const router = useRouter()
  const queryClient = useQueryClient()

  const resetState = useCallback(() => {
    setUrl('')
    setValidationError(null)
    setLastErrorStatus(null)
    setDeckName('')
    setSelectedFile(null)
    setCsvError(null)
    setPasteText('')
    setPasteDeckName('')
    setPasteError(null)
    setPreviewData(null)
    setImportMode('add_new_cards')
    setImportFormat('commander')
  }, [])

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
        setPreviewData(data)
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })

      if (data.allocationSummary.errors.length > 0) {
        toast.warning('Deck imported with allocation warnings', {
          description: data.allocationSummary.errors.join('; '),
        })
      } else {
        toast.success('Deck imported successfully')
      }

      setOpen(false)
      resetState()
      router.push(`/decks/${data.deckId}?freshImport=true`)
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
        "This URL format isn't supported. We support Archidekt and Moxfield deck URLs."
      )
      return
    }

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

    const name = pasteDeckName.trim() || 'Imported Deck'
    const result = parseTextDecklist(trimmed, name)

    if (isTextParseError(result)) {
      setPasteError(result.error)
      return
    }

    if (result.warnings.length > 0) {
      toast.info(`Parsed with ${result.warnings.length} warning(s)`, {
        description: result.warnings.slice(0, 3).join('; '),
      })
    }

    setPreviewData({ deck: result.deck, cardsByType: {} as CardsByType })
  }

  async function handleCSVImport() {
    setCsvError(null)

    if (!selectedFile) {
      setCsvError('Please select a CSV file')
      return
    }

    try {
      const csvText = await selectedFile.text()
      const result = parseDeckCSV(csvText, deckName || selectedFile.name.replace(/\.csv$/i, ''))

      if (isCSVParseError(result)) {
        setCsvError(result.error)
        return
      }

      if (result.warnings.length > 0) {
        toast.info(`Parsed with ${result.warnings.length} warning(s)`, {
          description: result.warnings.slice(0, 3).join('; '),
        })
      }

      setPreviewData({ deck: result.deck, cardsByType: {} as CardsByType })
    } catch {
      setCsvError('Failed to read CSV file')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (activeTab === 'url') handleUrlSubmit()
      else if (activeTab === 'csv') handleCSVImport()
      else if (activeTab === 'paste') handlePasteSubmit()
    }
  }

  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setCsvError(null)
      if (!deckName) {
        setDeckName(file.name.replace(/\.csv$/i, '').replace(/[-_]/g, ' '))
      }
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

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetState()
      setActiveTab('url')
      previewMutation.reset()
      importMutation.reset()
    }
  }

  const urlDisplayError = validationError ?? (previewMutation.isError ? previewMutation.error.message : null)
  const csvDisplayError = csvError ?? (importMutation.isError && activeTab === 'csv' ? importMutation.error.message : null)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button className={className ?? ''} />
        }
      >
        <Download className="size-4" aria-hidden="true" />
        Import Deck
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        {/* ─── Confirmation Step (mode picker) ─── */}
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
                  className="rounded-lg border px-4 py-3 text-left transition-colors"
                  style={importMode === 'add_new_cards'
                    ? { borderColor: 'var(--accent-primary)', background: 'var(--accent-primary-bg)' }
                    : { borderColor: 'var(--border-default)' }
                  }
                  onClick={() => setImportMode('add_new_cards')}
                >
                  <span className="block text-[length:var(--fs-md)] font-medium">These are new cards</span>
                  <span className="block text-[length:var(--fs-sm)] text-muted-foreground">
                    Add to my collection and fill all deck slots automatically
                  </span>
                </button>
                <button
                  type="button"
                  className="rounded-lg border px-4 py-3 text-left transition-colors"
                  style={importMode === 'existing_collection'
                    ? { borderColor: 'var(--accent-primary)', background: 'var(--accent-primary-bg)' }
                    : { borderColor: 'var(--border-default)' }
                  }
                  onClick={() => setImportMode('existing_collection')}
                >
                  <span className="block text-[length:var(--fs-md)] font-medium">Match against my collection</span>
                  <span className="block text-[length:var(--fs-sm)] text-muted-foreground">
                    Find cards I already own and show what I'm missing
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
                {importMutation.isPending ? 'Importing...' : 'Import Deck'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Import Deck</DialogTitle>
              <DialogDescription>
                Import a deck from a URL, paste a decklist, or upload a CSV file.
              </DialogDescription>
            </DialogHeader>

            {/* Input mode tabs */}
            <div className="flex gap-1 rounded-md p-0.5" style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)' }}>
              {(['url', 'paste', 'csv'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className="flex-1 rounded px-3 py-1.5 text-[length:var(--fs-sm)] font-medium transition-colors"
                  style={activeTab === tab
                    ? { background: 'var(--accent-primary)', color: 'white' }
                    : { color: 'var(--text-tertiary)' }
                  }
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'url' ? 'URL' : tab === 'paste' ? 'Paste List' : 'CSV'}
                </button>
              ))}
            </div>

            {/* URL tab */}
            {activeTab === 'url' && (
              <div className="flex flex-col gap-3">
                <Input
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
            )}

            {/* Paste tab */}
            {activeTab === 'paste' && (
              <div className="flex flex-col gap-3">
                <Input
                  type="text"
                  value={pasteDeckName}
                  onChange={(e) => setPasteDeckName(e.target.value)}
                  placeholder="Deck name"
                  disabled={importMutation.isPending}
                />
                <textarea
                  value={pasteText}
                  onChange={(e) => { setPasteText(e.target.value); setPasteError(null) }}
                  onKeyDown={handleKeyDown}
                  placeholder={"1 Sol Ring\n1 Command Tower\n1 Arcane Signet\n..."}
                  disabled={importMutation.isPending}
                  rows={8}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[length:var(--fs-sm)] text-foreground placeholder:text-muted-foreground focus:border-[var(--accent-primary)] focus:outline-none resize-none font-mono"
                />

                {pasteError && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2" role="alert">
                    <p className="text-[length:var(--fs-md)] text-destructive">{pasteError}</p>
                  </div>
                )}
              </div>
            )}

            {/* CSV tab */}
            {activeTab === 'csv' && (
              <div className="flex flex-col gap-3">
                <Input
                  type="text"
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Deck name (e.g. 'World Breaker')"
                  disabled={importMutation.isPending}
                />
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()} disabled={importMutation.isPending}>
                    <Upload className="size-3.5" aria-hidden="true" data-icon="inline-start" />
                    Choose CSV File
                  </Button>
                  <span className="text-[length:var(--fs-sm)] text-muted-foreground truncate">
                    {selectedFile?.name || 'No file selected'}
                  </span>
                </div>
                <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />

                {csvDisplayError && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2" role="alert">
                    <p className="text-[length:var(--fs-md)] text-destructive">{csvDisplayError}</p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              {activeTab === 'url' && (
                <Button onClick={handleUrlSubmit} disabled={previewMutation.isPending || !url.trim()}>
                  {previewMutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" data-icon="inline-start" />}
                  {previewMutation.isPending ? 'Fetching...' : 'Fetch Deck'}
                </Button>
              )}
              {activeTab === 'paste' && (
                <Button onClick={handlePasteSubmit} disabled={!pasteText.trim()}>
                  Continue
                </Button>
              )}
              {activeTab === 'csv' && (
                <Button onClick={handleCSVImport} disabled={importMutation.isPending || !selectedFile}>
                  {importMutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" data-icon="inline-start" />}
                  Continue
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
