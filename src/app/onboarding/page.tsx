'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Check, AlertTriangle, ExternalLink, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { DeckImportProgressList } from '@/components/DeckImportProgressList'
import type { CollectionImportResult, DeckListEntry } from '@/lib/warm-start-import'
import type { BatchResolutionResult, DeckResolutionResult } from '@/lib/warm-start-resolve'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OnboardingStep = 'source' | 'fields' | 'decks' | 'summary'
type ImportSource = 'archidekt' | 'moxfield'

interface MoxfieldDeckEntry {
  id: string
  name: string
  cardCount: number
  isPrivate: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMoxfieldUsername(input: string): string {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/moxfield\.com\/users\/([^\/\?]+)/)
  if (urlMatch) return urlMatch[1]
  return trimmed
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLLECTION_STATUS_MESSAGES = [
  'Fetching your collection…',
  'Importing card data…',
  'This can take a minute for larger collections…',
  'Almost there…',
]

// ---------------------------------------------------------------------------
// Import Progress Types
// ---------------------------------------------------------------------------

interface ImportProgress {
  current: number
  total: number
  currentDeckName: string
  completedResults: DeckResolutionResult[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter()

  const [step, setStep] = useState<OnboardingStep>('source')
  const [source, setSource] = useState<ImportSource | null>(null)
  const [collectionResult, setCollectionResult] = useState<CollectionImportResult | null>(null)

  // Archidekt state
  const [collectionUrl, setCollectionUrl] = useState('')
  const [deckList, setDeckList] = useState<DeckListEntry[]>([])
  const [selectedDecks, setSelectedDecks] = useState<Set<number>>(new Set())
  const [deckStatuses, setDeckStatuses] = useState<Map<number, 'brew' | 'boxed'>>(new Map())

  // Moxfield state
  const [moxfieldUsername, setMoxfieldUsername] = useState('')
  const [moxfieldCsvFile, setMoxfieldCsvFile] = useState<File | null>(null)
  const [moxfieldDeckList, setMoxfieldDeckList] = useState<MoxfieldDeckEntry[]>([])
  const [selectedMoxfieldDecks, setSelectedMoxfieldDecks] = useState<Set<string>>(new Set())
  const [moxfieldDeckStatuses, setMoxfieldDeckStatuses] = useState<Map<string, 'brew' | 'boxed'>>(new Map())

  // Shared state
  const [batchResult, setBatchResult] = useState<BatchResolutionResult | null>(null)

  // 6a: Rotating collection status text
  const [collectionStatusIdx, setCollectionStatusIdx] = useState(0)

  // 6b: Per-deck import progress
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)

  // ─── Archidekt: Collection Import ───────────────────────────────────────────

  const archidektCollectionMutation = useMutation({
    mutationFn: async (): Promise<CollectionImportResult> => {
      const res = await fetch('/api/onboarding/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Import failed' }))
        if (res.status === 403) {
          throw new Error(
            'Your collection is private — set it to Public in Archidekt settings first, then try again.'
          )
        }
        throw new Error(body.error || 'Something went wrong. Please try again.')
      }
      return res.json()
    },
    onSuccess: async (data) => {
      setCollectionResult(data)
      if (data.errors.length > 0) {
        toast.warning(`Collection imported with ${data.errors.length} warning(s)`)
      }
      try {
        const res = await fetch('/api/onboarding/decks')
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Failed to fetch decks' }))
          toast.error(body.error || 'Failed to fetch deck list')
          return
        }
        const deckData: { decks: DeckListEntry[]; errors: string[] } = await res.json()
        setDeckList(deckData.decks)
        const initialStatuses = new Map<number, 'brew' | 'boxed'>()
        for (const deck of deckData.decks) {
          initialStatuses.set(deck.id, 'boxed')
        }
        setDeckStatuses(initialStatuses)
        if (deckData.errors.length > 0) toast.info(deckData.errors[0])
        setStep('decks')
      } catch {
        toast.error('Failed to fetch deck list')
      }
    },
  })

  // ─── Moxfield: Collection Import + Deck Fetch ──────────────────────────────

  const moxfieldCollectionMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!moxfieldCsvFile) throw new Error('Please select a CSV file first.')
      const username = parseMoxfieldUsername(moxfieldUsername)
      if (!username) throw new Error('Please enter a Moxfield username or profile URL.')

      // Step 1: Upload CSV collection
      const formData = new FormData()
      formData.append('file', moxfieldCsvFile)
      const collRes = await fetch('/api/onboarding/moxfield/collection', {
        method: 'POST',
        body: formData,
      })
      if (!collRes.ok) {
        const body = await collRes.json().catch(() => ({ error: 'Import failed' }))
        throw new Error(body.error || 'Collection import failed.')
      }
      const collData = await collRes.json()
      setCollectionResult(collData)
      if (collData.errors?.length > 0) {
        toast.warning(`Collection imported with ${collData.errors.length} warning(s)`)
      }

      // Step 2: Fetch deck list
      const deckRes = await fetch(
        `/api/onboarding/moxfield/decks?username=${encodeURIComponent(username)}`
      )
      if (!deckRes.ok) {
        const body = await deckRes.json().catch(() => ({ error: 'Failed to fetch decks' }))
        throw new Error(body.error || 'Failed to fetch deck list.')
      }
      const deckData: { decks: MoxfieldDeckEntry[]; errors: string[] } = await deckRes.json()
      setMoxfieldDeckList(deckData.decks)
      const initialStatuses = new Map<string, 'brew' | 'boxed'>()
      for (const deck of deckData.decks) {
        initialStatuses.set(deck.id, 'boxed')
      }
      setMoxfieldDeckStatuses(initialStatuses)
      if (deckData.errors.length > 0) toast.info(deckData.errors[0])
    },
    onSuccess: () => {
      setStep('decks')
    },
  })

  // ─── 6a: Rotating status text during collection fetch ─────────────────────

  useEffect(() => {
    if (!archidektCollectionMutation.isPending && !moxfieldCollectionMutation.isPending) {
      setCollectionStatusIdx(0)
      return
    }
    const interval = setInterval(() => {
      setCollectionStatusIdx((prev) => (prev + 1) % COLLECTION_STATUS_MESSAGES.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [archidektCollectionMutation.isPending, moxfieldCollectionMutation.isPending])

  // ─── Archidekt: Deck Resolution (Sequential per-deck) ────────────────────

  const archidektResolveMutation = useMutation({
    mutationFn: async (deckIds: number[]): Promise<BatchResolutionResult> => {
      const completedResults: DeckResolutionResult[] = []
      let totalMatched = 0
      let totalUnresolved = 0

      for (let i = 0; i < deckIds.length; i++) {
        const deckId = deckIds[i]
        const status = deckStatuses.get(deckId) ?? 'boxed'

        // Find deck name for progress display
        const deckEntry = deckList.find(d => d.id === deckId)
        setImportProgress({
          current: i + 1,
          total: deckIds.length,
          currentDeckName: deckEntry?.name ?? `Deck ${deckId}`,
          completedResults: [...completedResults],
        })

        const res = await fetch('/api/onboarding/resolve-one', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckId, status }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Failed' }))
          completedResults.push({
            deckId,
            deckName: deckEntry?.name ?? `Deck ${deckId}`,
            totalCards: 0,
            matched: 0,
            unresolved: 0,
            unresolvedCards: [],
            errors: [body.error || 'Resolution failed'],
          })
          continue
        }

        const result: DeckResolutionResult = await res.json()
        completedResults.push(result)
        totalMatched += result.matched
        totalUnresolved += result.unresolved
      }

      // Client-side contention detection: for each deck with unresolved cards,
      // check if another deck in this batch has that card resolved
      const contentions: Array<{
        cardName: string
        keptByDeckId: number
        keptByDeckName: string
        lostByDeckId: number
        lostByDeckName: string
      }> = []

      for (const result of completedResults) {
        if (result.unresolvedCards.length === 0) continue
        for (const cardName of result.unresolvedCards) {
          const winner = completedResults.find(
            r => r.deckId !== result.deckId && !r.unresolvedCards.includes(cardName) && r.matched > 0
          )
          if (winner) {
            const alreadyRecorded = contentions.some(
              c => c.cardName === cardName && c.keptByDeckId === winner.deckId && c.lostByDeckId === result.deckId
            )
            if (!alreadyRecorded) {
              contentions.push({
                cardName,
                keptByDeckId: winner.deckId,
                keptByDeckName: winner.deckName,
                lostByDeckId: result.deckId,
                lostByDeckName: result.deckName,
              })
            }
          }
        }
      }

      setImportProgress(null)

      return {
        decksProcessed: deckIds.length,
        results: completedResults,
        totalMatched,
        totalUnresolved,
        contentions,
        durationMs: 0,
      }
    },
    onSuccess: (data) => {
      setBatchResult(data)
      setStep('summary')
    },
  })

  // ─── Moxfield: Deck Resolution (Sequential per-deck) ───────────────────────

  const moxfieldResolveMutation = useMutation({
    mutationFn: async (deckIds: string[]): Promise<BatchResolutionResult> => {
      const completedResults: DeckResolutionResult[] = []
      let totalMatched = 0
      let totalUnresolved = 0

      for (let i = 0; i < deckIds.length; i++) {
        const deckId = deckIds[i]
        const status = moxfieldDeckStatuses.get(deckId) ?? 'boxed'

        // Find deck name for progress display
        const deckEntry = moxfieldDeckList.find(d => d.id === deckId)
        setImportProgress({
          current: i + 1,
          total: deckIds.length,
          currentDeckName: deckEntry?.name ?? `Deck ${deckId}`,
          completedResults: [...completedResults],
        })

        const res = await fetch('/api/onboarding/moxfield/resolve-one', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckId, status }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Failed' }))
          completedResults.push({
            deckId: 0,
            deckName: deckEntry?.name ?? `Deck ${deckId}`,
            totalCards: 0,
            matched: 0,
            unresolved: 0,
            unresolvedCards: [],
            errors: [body.error || 'Resolution failed'],
          })
          continue
        }

        const result: DeckResolutionResult = await res.json()
        completedResults.push(result)
        totalMatched += result.matched
        totalUnresolved += result.unresolved
      }

      // Client-side contention detection
      const contentions: Array<{
        cardName: string
        keptByDeckId: number
        keptByDeckName: string
        lostByDeckId: number
        lostByDeckName: string
      }> = []

      for (const result of completedResults) {
        if (result.unresolvedCards.length === 0) continue
        for (const cardName of result.unresolvedCards) {
          const winner = completedResults.find(
            r => r.deckId !== result.deckId && !r.unresolvedCards.includes(cardName) && r.matched > 0
          )
          if (winner) {
            const alreadyRecorded = contentions.some(
              c => c.cardName === cardName && c.keptByDeckId === winner.deckId && c.lostByDeckId === result.deckId
            )
            if (!alreadyRecorded) {
              contentions.push({
                cardName,
                keptByDeckId: winner.deckId,
                keptByDeckName: winner.deckName,
                lostByDeckId: result.deckId,
                lostByDeckName: result.deckName,
              })
            }
          }
        }
      }

      setImportProgress(null)

      return {
        decksProcessed: deckIds.length,
        results: completedResults,
        totalMatched,
        totalUnresolved,
        contentions,
        durationMs: 0,
      }
    },
    onSuccess: (data) => {
      setBatchResult(data)
      setStep('summary')
    },
  })

  // ─── Deck Picker Handlers ──────────────────────────────────────────────────

  function handleToggleDeck(deckId: number) {
    setSelectedDecks((prev) => {
      const next = new Set(prev)
      if (next.has(deckId)) next.delete(deckId)
      else next.add(deckId)
      return next
    })
  }

  function handleToggleStatus(deckId: number) {
    setDeckStatuses((prev) => {
      const next = new Map(prev)
      next.set(deckId, next.get(deckId) === 'boxed' ? 'brew' : 'boxed')
      return next
    })
  }

  function handleToggleMoxfieldDeck(deckId: string) {
    setSelectedMoxfieldDecks((prev) => {
      const next = new Set(prev)
      if (next.has(deckId)) next.delete(deckId)
      else next.add(deckId)
      return next
    })
  }

  function handleToggleMoxfieldStatus(deckId: string) {
    setMoxfieldDeckStatuses((prev) => {
      const next = new Map(prev)
      next.set(deckId, next.get(deckId) === 'boxed' ? 'brew' : 'boxed')
      return next
    })
  }

  function handleImportDecks() {
    if (source === 'archidekt') {
      const deckIds = Array.from(selectedDecks)
      if (deckIds.length === 0) { toast.error('Select at least one deck to import'); return }
      archidektResolveMutation.mutate(deckIds)
    } else {
      const deckIds = Array.from(selectedMoxfieldDecks)
      if (deckIds.length === 0) { toast.error('Select at least one deck to import'); return }
      moxfieldResolveMutation.mutate(deckIds)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const isResolving = archidektResolveMutation.isPending || moxfieldResolveMutation.isPending

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-default)] bg-card p-8 shadow-lg">
        {step === 'source' && (
          <SourcePickerScreen
            source={source}
            setSource={setSource}
            onContinue={() => setStep('fields')}
          />
        )}

        {step === 'fields' && source === 'archidekt' && (
          <ArchidektFieldsScreen
            url={collectionUrl}
            setUrl={setCollectionUrl}
            isPending={archidektCollectionMutation.isPending}
            error={archidektCollectionMutation.isError ? archidektCollectionMutation.error.message : null}
            onSubmit={() => archidektCollectionMutation.mutate()}
            onBack={() => setStep('source')}
            statusMessage={COLLECTION_STATUS_MESSAGES[collectionStatusIdx]}
          />
        )}

        {step === 'fields' && source === 'moxfield' && (
          <MoxfieldFieldsScreen
            username={moxfieldUsername}
            setUsername={setMoxfieldUsername}
            csvFile={moxfieldCsvFile}
            setCsvFile={setMoxfieldCsvFile}
            isPending={moxfieldCollectionMutation.isPending}
            error={moxfieldCollectionMutation.isError ? moxfieldCollectionMutation.error.message : null}
            onSubmit={() => moxfieldCollectionMutation.mutate()}
            onBack={() => setStep('source')}
            statusMessage={COLLECTION_STATUS_MESSAGES[collectionStatusIdx]}
          />
        )}

        {step === 'decks' && source === 'archidekt' && (
          <DeckPickerScreen
            deckList={deckList}
            selectedDecks={selectedDecks}
            deckStatuses={deckStatuses}
            collectionResult={collectionResult}
            onToggleDeck={handleToggleDeck}
            onToggleStatus={handleToggleStatus}
            onImport={handleImportDecks}
            onSkip={() => router.push('/')}
            isPending={isResolving}
            importProgress={importProgress}
          />
        )}

        {step === 'decks' && source === 'moxfield' && (
          <MoxfieldDeckPickerScreen
            deckList={moxfieldDeckList}
            selectedDecks={selectedMoxfieldDecks}
            deckStatuses={moxfieldDeckStatuses}
            collectionResult={collectionResult}
            onToggleDeck={handleToggleMoxfieldDeck}
            onToggleStatus={handleToggleMoxfieldStatus}
            onImport={handleImportDecks}
            onSkip={() => router.push('/')}
            isPending={isResolving}
            importProgress={importProgress}
          />
        )}

        {step === 'summary' && (
          <SummaryScreen
            batchResult={batchResult}
            onFinish={() => router.push('/')}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 1: Source Picker
// ---------------------------------------------------------------------------

function SourcePickerScreen({
  source,
  setSource,
  onContinue,
}: {
  source: ImportSource | null
  setSource: (s: ImportSource) => void
  onContinue: () => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[length:var(--fs-xl)] font-semibold">
          Where is your collection?
        </h1>
        <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
          We&rsquo;ll pull your cards and decks from whichever platform you use.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setSource('archidekt')}
          className={`flex flex-col items-center gap-3 rounded-xl border-2 px-4 py-6 text-center transition-all ${
            source === 'archidekt'
              ? 'border-teal-400 bg-teal-400/10'
              : 'border-[var(--border-default)] hover:border-teal-400/50'
          }`}
        >
          <div className="flex size-12 items-center justify-center rounded-lg bg-white/10 text-xl font-bold">
            A
          </div>
          <span className="text-[length:var(--fs-md)] font-medium">Archidekt</span>
          <span className="text-[length:var(--fs-xs)] text-muted-foreground">
            Collection URL + public decks
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSource('moxfield')}
          className={`flex flex-col items-center gap-3 rounded-xl border-2 px-4 py-6 text-center transition-all ${
            source === 'moxfield'
              ? 'border-teal-400 bg-teal-400/10'
              : 'border-[var(--border-default)] hover:border-teal-400/50'
          }`}
        >
          <div className="flex size-12 items-center justify-center rounded-lg bg-white/10 text-xl font-bold">
            M
          </div>
          <span className="text-[length:var(--fs-md)] font-medium">Moxfield</span>
          <span className="text-[length:var(--fs-xs)] text-muted-foreground">
            Username + CSV collection
          </span>
        </button>
      </div>

      <Button onClick={onContinue} disabled={!source} className="w-full">
        Continue
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 2a: Archidekt Fields
// ---------------------------------------------------------------------------

function ArchidektFieldsScreen({
  url,
  setUrl,
  isPending,
  error,
  onSubmit,
  onBack,
  statusMessage,
}: {
  url: string
  setUrl: (v: string) => void
  isPending: boolean
  error: string | null
  onSubmit: () => void
  onBack: () => void
  statusMessage: string
}) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); onSubmit() }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isPending}
          className="flex items-center gap-1 text-[length:var(--fs-sm)] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </button>
      </div>

      <div>
        <h1 className="text-[length:var(--fs-xl)] font-semibold">
          Import your Archidekt collection
        </h1>
        <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
          We&rsquo;ll pull your full collection, then let you choose which decks to bring in.
        </p>
      </div>

      {/* Privacy callout */}
      <div
        className="rounded-lg px-4 py-3"
        style={{ background: 'rgba(239,159,39,0.1)', border: '1px solid rgba(239,159,39,0.3)' }}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
          <p className="text-[length:var(--fs-sm)] text-amber-200">
            Your Archidekt collection and decks need to be set to{' '}
            <strong>Public</strong> for this to work — Archidekt doesn&rsquo;t let apps read
            private data. You can set them back to private once the import finishes.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="archidekt.com/collection/v2/..."
          disabled={isPending}
          aria-label="Archidekt username or collection URL"
        />

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2" role="alert" aria-live="polite">
            <p className="text-[length:var(--fs-sm)] text-destructive">{error}</p>
          </div>
        )}

        {isPending && (
          <div className="flex items-center gap-2 text-[length:var(--fs-sm)] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {statusMessage}
          </div>
        )}
      </div>

      <Button onClick={onSubmit} disabled={isPending} className="w-full">
        {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" data-icon="inline-start" />}
        {isPending ? 'Fetching...' : 'Fetch Collection'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 2b: Moxfield Fields
// ---------------------------------------------------------------------------

function MoxfieldFieldsScreen({
  username,
  setUsername,
  csvFile,
  setCsvFile,
  isPending,
  error,
  onSubmit,
  onBack,
  statusMessage,
}: {
  username: string
  setUsername: (v: string) => void
  csvFile: File | null
  setCsvFile: (f: File | null) => void
  isPending: boolean
  error: string | null
  onSubmit: () => void
  onBack: () => void
  statusMessage: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setCsvFile(file)
  }

  const canSubmit = username.trim().length > 0 && csvFile !== null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isPending}
          className="flex items-center gap-1 text-[length:var(--fs-sm)] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </button>
      </div>

      <div>
        <h1 className="text-[length:var(--fs-xl)] font-semibold">
          Import your Moxfield collection
        </h1>
        <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
          We&rsquo;ll import your collection CSV and fetch your public decks.
        </p>
      </div>

      {/* CSV export instruction callout */}
      <div
        className="rounded-lg px-4 py-3"
        style={{ background: 'rgba(239,159,39,0.1)', border: '1px solid rgba(239,159,39,0.3)' }}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
          <p className="text-[length:var(--fs-sm)] text-amber-200">
            Moxfield doesn&rsquo;t have a public collection API. You&rsquo;ll need to download
            your collection as a CSV first:{' '}
            <strong>Collection &rarr; Export &rarr; CSV</strong>, then upload it here.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mox-username" className="text-[length:var(--fs-sm)] font-medium">
            Username or profile URL
          </label>
          <Input
            id="mox-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username or moxfield.com/users/..."
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[length:var(--fs-sm)] font-medium">
            Collection CSV
          </label>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
              type="button"
            >
              Choose File
            </Button>
            <span className="truncate text-[length:var(--fs-sm)] text-muted-foreground">
              {csvFile ? csvFile.name : 'No file selected'}
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2" role="alert" aria-live="polite">
            <p className="text-[length:var(--fs-sm)] text-destructive">{error}</p>
          </div>
        )}

        {isPending && (
          <div className="flex items-center gap-2 text-[length:var(--fs-sm)] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {statusMessage}
          </div>
        )}
      </div>

      <Button onClick={onSubmit} disabled={isPending || !canSubmit} className="w-full">
        {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" data-icon="inline-start" />}
        {isPending ? 'Importing...' : 'Import Collection & Fetch Decks'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 3a: Archidekt Deck Multi-Select
// ---------------------------------------------------------------------------

function DeckPickerScreen({
  deckList,
  selectedDecks,
  deckStatuses,
  collectionResult,
  onToggleDeck,
  onToggleStatus,
  onImport,
  onSkip,
  isPending,
  importProgress,
}: {
  deckList: DeckListEntry[]
  selectedDecks: Set<number>
  deckStatuses: Map<number, 'brew' | 'boxed'>
  collectionResult: CollectionImportResult | null
  onToggleDeck: (id: number) => void
  onToggleStatus: (id: number) => void
  onImport: () => void
  onSkip: () => void
  isPending: boolean
  importProgress: ImportProgress | null
}) {
  const selectedCount = selectedDecks.size

  // When importing, show the progress list instead of the picker
  if (isPending) {
    const selectedDeckList = deckList.filter((d) => selectedDecks.has(d.id))
    const decks = selectedDeckList.map((d, idx) => {
      const completedResult = importProgress?.completedResults.find((r) => r.deckId === d.id || r.deckName === d.name)
      const isActive = importProgress && idx === importProgress.current - 1 && !completedResult
      return {
        id: d.id,
        name: d.name,
        state: completedResult ? 'done' as const : isActive ? 'active' as const : 'queued' as const,
        result: completedResult,
      }
    })

    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-[length:var(--fs-xl)] font-semibold">Importing decks</h1>
          {importProgress && (
            <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
              Deck {importProgress.current} of {importProgress.total}
            </p>
          )}
        </div>

        <DeckImportProgressList decks={decks} isRunning={true} />

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" disabled>Skip</Button>
          <Button disabled>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Importing…
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[length:var(--fs-xl)] font-semibold">Choose decks to import</h1>
        {collectionResult && (
          <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
            {collectionResult.physicalCopiesCreated.toLocaleString()} cards found in your collection.
          </p>
        )}
      </div>

      {/* Deck list */}
      <div className="flex max-h-[360px] flex-col gap-1 overflow-y-auto rounded-lg border border-[var(--border-default)] p-2">
        {deckList.length === 0 ? (
          <p className="px-3 py-4 text-center text-[length:var(--fs-sm)] text-muted-foreground">
            No public decks found.
          </p>
        ) : (
          deckList.map((deck) => {
            const isSelected = selectedDecks.has(deck.id)
            const status = deckStatuses.get(deck.id) ?? 'boxed'
            return (
              <div
                key={deck.id}
                className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-white/5"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleDeck(deck.id)}
                  aria-label={`Select ${deck.name}`}
                />
                <span className="flex-1 truncate text-[length:var(--fs-md)]">{deck.name}</span>

                <div
                  className={`inline-flex items-center rounded-full p-0.5 transition-colors ${
                    !isSelected ? 'opacity-40 pointer-events-none' : ''
                  }`}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <button
                    type="button"
                    onClick={() => { if (status !== 'brew') onToggleStatus(deck.id) }}
                    disabled={!isSelected}
                    className="rounded-full px-2.5 py-1 text-[length:var(--fs-xs)] font-medium transition-all"
                    style={
                      status === 'brew'
                        ? { background: 'rgba(239,159,39,0.2)', color: '#ef9f27' }
                        : { color: 'rgba(255,255,255,0.4)' }
                    }
                  >
                    Brew
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (status !== 'boxed') onToggleStatus(deck.id) }}
                    disabled={!isSelected}
                    className="rounded-full px-2.5 py-1 text-[length:var(--fs-xs)] font-medium transition-all"
                    style={
                      status === 'boxed'
                        ? { background: 'rgba(20,184,166,0.2)', color: '#14b8a6' }
                        : { color: 'rgba(255,255,255,0.4)' }
                    }
                  >
                    Boxed
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <p className="text-[length:var(--fs-sm)] text-muted-foreground">
        {selectedCount > 0 ? `${selectedCount} selected` : 'None selected'} &middot; imported
        decks assume <em>use collection</em> — you can adjust individual cards after
      </p>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={onSkip}>
          Skip
        </Button>
        <Button onClick={onImport} disabled={selectedCount === 0}>
          Import {selectedCount} Deck{selectedCount !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 3b: Moxfield Deck Multi-Select
// ---------------------------------------------------------------------------

function MoxfieldDeckPickerScreen({
  deckList,
  selectedDecks,
  deckStatuses,
  collectionResult,
  onToggleDeck,
  onToggleStatus,
  onImport,
  onSkip,
  isPending,
  importProgress,
}: {
  deckList: MoxfieldDeckEntry[]
  selectedDecks: Set<string>
  deckStatuses: Map<string, 'brew' | 'boxed'>
  collectionResult: CollectionImportResult | null
  onToggleDeck: (id: string) => void
  onToggleStatus: (id: string) => void
  onImport: () => void
  onSkip: () => void
  isPending: boolean
  importProgress: ImportProgress | null
}) {
  const selectedCount = selectedDecks.size

  // When importing, show the progress list instead of the picker
  if (isPending) {
    const selectedDeckList = deckList.filter((d) => selectedDecks.has(d.id))
    const decks = selectedDeckList.map((d, idx) => {
      const completedResult = importProgress?.completedResults.find((r) => r.deckName === d.name)
      const isActive = importProgress && idx === importProgress.current - 1 && !completedResult
      return {
        id: d.id,
        name: d.name,
        state: completedResult ? 'done' as const : isActive ? 'active' as const : 'queued' as const,
        result: completedResult,
      }
    })

    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-[length:var(--fs-xl)] font-semibold">Importing decks</h1>
          {importProgress && (
            <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
              Deck {importProgress.current} of {importProgress.total}
            </p>
          )}
        </div>

        <DeckImportProgressList decks={decks} isRunning={true} />

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" disabled>Skip</Button>
          <Button disabled>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Importing…
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[length:var(--fs-xl)] font-semibold">Choose decks to import</h1>
        {collectionResult && (
          <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
            {collectionResult.physicalCopiesCreated.toLocaleString()} cards found in your collection.
          </p>
        )}
      </div>

      <div className="flex max-h-[360px] flex-col gap-1 overflow-y-auto rounded-lg border border-[var(--border-default)] p-2">
        {deckList.length === 0 ? (
          <p className="px-3 py-4 text-center text-[length:var(--fs-sm)] text-muted-foreground">
            No public decks found.
          </p>
        ) : (
          deckList.map((deck) => {
            const isSelected = selectedDecks.has(deck.id)
            const status = deckStatuses.get(deck.id) ?? 'boxed'
            return (
              <div
                key={deck.id}
                className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-white/5"
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleDeck(deck.id)}
                  aria-label={`Select ${deck.name}`}
                />
                <span className="flex-1 truncate text-[length:var(--fs-md)]">{deck.name}</span>
                {deck.cardCount > 0 && (
                  <span className="text-[length:var(--fs-xs)] text-muted-foreground">
                    {deck.cardCount}
                  </span>
                )}
                <div
                  className={`inline-flex items-center rounded-full p-0.5 transition-colors ${
                    !isSelected ? 'opacity-40 pointer-events-none' : ''
                  }`}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <button
                    type="button"
                    onClick={() => { if (status !== 'brew') onToggleStatus(deck.id) }}
                    disabled={!isSelected}
                    className="rounded-full px-2.5 py-1 text-[length:var(--fs-xs)] font-medium transition-all"
                    style={
                      status === 'brew'
                        ? { background: 'rgba(239,159,39,0.2)', color: '#ef9f27' }
                        : { color: 'rgba(255,255,255,0.4)' }
                    }
                  >
                    Brew
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (status !== 'boxed') onToggleStatus(deck.id) }}
                    disabled={!isSelected}
                    className="rounded-full px-2.5 py-1 text-[length:var(--fs-xs)] font-medium transition-all"
                    style={
                      status === 'boxed'
                        ? { background: 'rgba(20,184,166,0.2)', color: '#14b8a6' }
                        : { color: 'rgba(255,255,255,0.4)' }
                    }
                  >
                    Boxed
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <p className="text-[length:var(--fs-sm)] text-muted-foreground">
        {selectedCount > 0 ? `${selectedCount} selected` : 'None selected'} &middot; imported
        decks assume <em>use collection</em> — you can adjust individual cards after
      </p>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={onSkip}>
          Skip
        </Button>
        <Button onClick={onImport} disabled={selectedCount === 0}>
          Import {selectedCount} Deck{selectedCount !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screen 4: End-of-Batch Summary
// ---------------------------------------------------------------------------

function SummaryScreen({
  batchResult,
  onFinish,
}: {
  batchResult: BatchResolutionResult | null
  onFinish: () => void
}) {
  if (!batchResult) return null

  const totalDecks = batchResult.decksProcessed
  const totalMatched = batchResult.totalMatched
  const contentions = (batchResult as any).contentions ?? []

  // Build deck rows in the same shape as the progress list
  const decks = batchResult.results.map((result) => ({
    id: result.deckId,
    name: result.deckName,
    state: 'done' as const,
    result,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[length:var(--fs-xl)] font-semibold">Import complete</h1>
        <p className="mt-1 text-[length:var(--fs-md)] text-muted-foreground">
          {totalDecks} deck{totalDecks !== 1 ? 's' : ''} imported
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-[var(--border-default)] px-4 py-3">
          <p className="text-[length:var(--fs-xs)] text-muted-foreground">Decks imported</p>
          <p className="text-[length:var(--fs-xl)] font-semibold">{totalDecks}</p>
        </div>
        <div className="rounded-lg border border-[var(--border-default)] px-4 py-3">
          <p className="text-[length:var(--fs-xs)] text-muted-foreground">Cards resolved</p>
          <p className="text-[length:var(--fs-xl)] font-semibold">{totalMatched.toLocaleString()}</p>
        </div>
        <div
          className="rounded-lg border px-4 py-3"
          style={contentions.length > 0
            ? { borderColor: 'rgba(239,159,39,0.4)', background: 'rgba(239,159,39,0.05)' }
            : { borderColor: 'var(--border-default)' }
          }
        >
          <p className="text-[length:var(--fs-xs)] text-muted-foreground">Conflicts</p>
          <p
            className="text-[length:var(--fs-xl)] font-semibold"
            style={contentions.length > 0 ? { color: '#ef9f27' } : undefined}
          >
            {contentions.length}
          </p>
        </div>
      </div>

      {/* Per-deck results — same component as progress, in completed state */}
      <DeckImportProgressList
        decks={decks}
        contentions={contentions}
        isRunning={false}
      />

      <Button onClick={onFinish} className="w-full">
        Go to Decks
      </Button>
    </div>
  )
}
