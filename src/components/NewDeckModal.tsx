'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Sparkles, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { FORMAT_OPTIONS, getFormatConfig, type DeckFormat } from '@/lib/format-config'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewDeckModal() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'format' | 'method' | 'details'>('format')
  const [selectedFormat, setSelectedFormat] = useState<DeckFormat>('commander')
  const [deckName, setDeckName] = useState('')
  const [commanderName, setCommanderName] = useState('')
  const [commanderScryfallId, setCommanderScryfallId] = useState('')
  const [commanderCI, setCommanderCI] = useState('')

  const router = useRouter()
  const queryClient = useQueryClient()

  const formatConfig = getFormatConfig(selectedFormat)

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/decks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deckName.trim(),
          format: selectedFormat,
          commanderName: formatConfig.hasCommander ? commanderName.trim() : undefined,
          commanderScryfallId: formatConfig.hasCommander ? commanderScryfallId : undefined,
          colourIdentity: formatConfig.hasCommander ? commanderCI : undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create deck')
      }
      return res.json() as Promise<{ deckId: number }>
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decks'] })
      toast.success(`Created "${deckName}"`)
      setOpen(false)
      resetState()
      router.push(`/decks/${data.deckId}`)
    },
    onError: (err) => toast.error(err.message),
  })

  function resetState() {
    setStep('format')
    setSelectedFormat('commander')
    setDeckName('')
    setCommanderName('')
    setCommanderScryfallId('')
    setCommanderCI('')
  }

  function handleFormatSelect(format: DeckFormat) {
    setSelectedFormat(format)
    setStep('method')
  }

  function handleMethodSelect(method: 'ai' | 'manual') {
    if (method === 'ai') {
      // AI brew — go to /new-deck (existing canvas)
      setOpen(false)
      resetState()
      router.push('/new-deck')
    } else {
      // Manual — show details step
      setStep('details')
    }
  }

  function handleCreate() {
    if (!deckName.trim()) {
      toast.error('Please enter a deck name')
      return
    }
    if (formatConfig.hasCommander && !commanderName.trim()) {
      toast.error('Please enter a commander name')
      return
    }
    createMutation.mutate()
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="size-4" aria-hidden="true" />
        New Deck
      </Button>

      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { setOpen(false); resetState() } else { setOpen(true) } }}>
        <DialogContent className="sm:max-w-md">
          {/* ─── Step 1: Format Selection ─── */}
          {step === 'format' && (
            <>
              <DialogHeader>
                <DialogTitle>New deck</DialogTitle>
                <DialogDescription>What format is this deck?</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-2 py-2">
                {FORMAT_OPTIONS.map(opt => {
                  const config = getFormatConfig(opt.value)
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleFormatSelect(opt.value)}
                      className="flex flex-col items-start rounded-lg border border-[var(--border-default)] px-4 py-3 text-left transition-colors hover:border-[var(--accent-primary)] hover:bg-[var(--accent-primary-bg)]"
                    >
                      <span className="text-[length:var(--fs-md)] font-medium text-[var(--text-primary)]">
                        {opt.label}
                      </span>
                      <span className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">
                        {config.deckSize ? `${config.deckSize} cards` : 'No size limit'}
                        {config.singleton ? ' · singleton' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ─── Step 2: Method Selection ─── */}
          {step === 'method' && (
            <>
              <DialogHeader>
                <DialogTitle>{formatConfig.label} deck</DialogTitle>
                <DialogDescription>How do you want to build it?</DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-3 py-2">
                {/* AI Brew option */}
                <button
                  type="button"
                  onClick={() => handleMethodSelect('ai')}
                  disabled={!formatConfig.brewEnabled}
                  className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] px-4 py-4 text-left transition-colors hover:border-[var(--accent-primary)] hover:bg-[var(--accent-primary-bg)] disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Sparkles className="size-5 shrink-0 mt-0.5 text-[var(--accent-primary)]" />
                  <div>
                    <span className="block text-[length:var(--fs-md)] font-medium text-[var(--text-primary)]">
                      AI Brew
                    </span>
                    <span className="block text-[length:var(--fs-sm)] text-[var(--text-tertiary)]">
                      {formatConfig.brewEnabled
                        ? 'Explore commanders, get suggestions, build with AI assistance'
                        : `Not available for ${formatConfig.label} — Commander only`
                      }
                    </span>
                  </div>
                </button>

                {/* Manual option */}
                <button
                  type="button"
                  onClick={() => handleMethodSelect('manual')}
                  className="flex items-start gap-3 rounded-lg border border-[var(--border-default)] px-4 py-4 text-left transition-colors hover:border-[var(--accent-primary)] hover:bg-[var(--accent-primary-bg)]"
                >
                  <PenLine className="size-5 shrink-0 mt-0.5 text-[var(--text-secondary)]" />
                  <div>
                    <span className="block text-[length:var(--fs-md)] font-medium text-[var(--text-primary)]">
                      Manual
                    </span>
                    <span className="block text-[length:var(--fs-sm)] text-[var(--text-tertiary)]">
                      {formatConfig.hasCommander
                        ? 'Choose your commander and build the deck yourself'
                        : 'Create an empty deck and add cards yourself'
                      }
                    </span>
                  </div>
                </button>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setStep('format')}>
                  Back
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ─── Step 3: Deck Details (Manual) ─── */}
          {step === 'details' && (
            <>
              <DialogHeader>
                <DialogTitle>Deck details</DialogTitle>
                <DialogDescription>
                  {formatConfig.label} · Manual
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4 py-2">
                <div>
                  <label className="block text-[length:var(--fs-sm)] text-[var(--text-secondary)] mb-1">
                    Deck name
                  </label>
                  <Input
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                    placeholder="e.g. Muldrotha Graveyard Value"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                  />
                </div>

                {formatConfig.hasCommander && (
                  <div>
                    <label className="block text-[length:var(--fs-sm)] text-[var(--text-secondary)] mb-1">
                      Commander
                    </label>
                    <CommanderAutocomplete
                      value={commanderName}
                      onChange={(name, scryfallId, colorIdentity) => {
                        setCommanderName(name)
                        setCommanderScryfallId(scryfallId)
                        setCommanderCI(colorIdentity)
                      }}
                    />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setStep('method')}>
                  Back
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  {createMutation.isPending ? 'Creating...' : 'Create Deck'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}


// ---------------------------------------------------------------------------
// CommanderAutocomplete — debounced Scryfall search for valid commanders
// ---------------------------------------------------------------------------

interface CommanderResult {
  name: string
  scryfallId: string
  colorIdentity: string[]
  imageUri: string | null
}

function CommanderAutocomplete({
  value,
  onChange,
}: {
  value: string
  onChange: (name: string, scryfallId: string, colorIdentity: string) => void
}) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<CommanderResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync external value changes
  useEffect(() => { setQuery(value) }, [value])

  function handleInputChange(input: string) {
    setQuery(input)
    setSelectedIndex(-1)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (input.trim().length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/scryfall/commanders?q=${encodeURIComponent(input.trim())}`)
        if (res.ok) {
          const data: CommanderResult[] = await res.json()
          setResults(data)
          setIsOpen(data.length > 0)
        }
      } catch {
        setResults([])
      }
      setIsLoading(false)
    }, 250)
  }

  function handleSelect(result: CommanderResult) {
    setQuery(result.name)
    setIsOpen(false)
    setResults([])
    onChange(result.name, result.scryfallId, result.colorIdentity.join(','))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (results.length > 0) setIsOpen(true) }}
        onBlur={() => { setTimeout(() => setIsOpen(false), 200) }}
        placeholder="Search for a commander..."
        className="h-8 w-full rounded-lg border border-[var(--border-default)] bg-transparent px-2.5 py-1 text-[length:var(--fs-md)] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls="commander-results"
      />
      {isLoading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <Loader2 className="size-3.5 animate-spin text-[var(--text-tertiary)]" />
        </div>
      )}

      {/* Dropdown results */}
      {isOpen && results.length > 0 && (
        <div
          id="commander-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[240px] overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg"
        >
          {results.map((result, idx) => (
            <button
              key={result.scryfallId}
              type="button"
              role="option"
              aria-selected={idx === selectedIndex}
              onClick={() => handleSelect(result)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                idx === selectedIndex ? 'bg-[var(--accent-primary-bg)]' : 'hover:bg-[rgba(255,255,255,0.03)]'
              }`}
            >
              {/* Card art thumbnail */}
              {result.imageUri && (
                <img
                  src={result.imageUri}
                  alt=""
                  className="size-8 rounded object-cover"
                  loading="lazy"
                />
              )}
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[length:var(--fs-sm)] font-medium text-[var(--text-primary)]">
                  {result.name}
                </span>
                <span className="text-[length:var(--fs-xs)] text-[var(--text-tertiary)]">
                  {result.colorIdentity.length > 0 ? result.colorIdentity.join('') : 'Colorless'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
