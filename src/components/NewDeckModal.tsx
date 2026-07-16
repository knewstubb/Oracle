'use client'

import { useState } from 'react'
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
                    <Input
                      value={commanderName}
                      onChange={(e) => setCommanderName(e.target.value)}
                      placeholder="e.g. Muldrotha, the Gravetide"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
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
