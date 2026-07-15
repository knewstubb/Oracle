'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Trash2, Palette } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function SettingsPage() {
  const [confirmOpen, setConfirmOpen] = useState(false)

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/dev/reset', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Reset failed' }))
        throw new Error(body.errors?.join('; ') || body.error || 'Reset failed')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('All data cleared. Ready for a fresh import.')
      setConfirmOpen(false)
    },
    onError: (err: Error) => {
      toast.error(`Reset failed: ${err.message}`)
    },
  })

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8 bg-[var(--bg-canvas)] min-h-full">
      <PageHeader title="Settings" />

      <div className="space-y-8">
        {/* Dev Tools */}
        <section className="rounded-lg border border-destructive/30 p-6">
          <h2 className="text-[length:var(--fs-lg)] font-medium text-destructive">
            Developer Tools
          </h2>
          <p className="mt-1 text-[length:var(--fs-sm)] text-muted-foreground">
            These actions are destructive and cannot be undone.
          </p>
          <div className="mt-4">
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              className="gap-2"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Clear All Data
            </Button>
            <p className="mt-2 text-[length:var(--fs-xs)] text-muted-foreground">
              Deletes all decks, cards, physical copies, and brew sessions for your account.
              Use this to start a fresh onboarding test.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
            <Link
              href="/settings/components"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] px-3 py-2 text-[length:var(--fs-sm)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
            >
              <Palette className="size-4" aria-hidden="true" />
              Component Library
            </Link>
            <p className="mt-2 text-[length:var(--fs-xs)] text-muted-foreground">
              Browse all UI components, design tokens, colors, and typography.
            </p>
          </div>
        </section>
      </div>

      {/* Confirmation modal */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!resetMutation.isPending) setConfirmOpen(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear all data?</DialogTitle>
            <DialogDescription>
              This will permanently delete all your decks, physical copies, card definitions,
              and brew sessions. You&apos;ll need to run the onboarding import again.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={resetMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {resetMutation.isPending ? 'Clearing...' : 'Clear Everything'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
