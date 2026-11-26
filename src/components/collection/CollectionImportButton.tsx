'use client'

import { useSyncExternalStore } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ManaBoxCollectionImportDialog } from '@/components/manabox-import/ManaBoxCollectionImportDialog'

/**
 * The open state lives outside React components on purpose. The page shows an
 * import button in the header and another in the empty state; when the import
 * adds cards the empty state disappears. If each button owned its own dialog,
 * the result screen would vanish with it. Now there is one shared open state
 * and one dialog (rendered by the button with `withDialog`, the header one).
 */
let isOpen = false
const listeners = new Set<() => void>()

function setOpen(next: boolean) {
  isOpen = next
  listeners.forEach((fn) => fn())
}

function useImportOpen(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => isOpen,
    () => false
  )
}

/** The shared import dialog on its own, for pages that show the button only in some states. */
export function CollectionImportDialogHost() {
  const open = useImportOpen()
  return <ManaBoxCollectionImportDialog open={open} onOpenChange={setOpen} />
}
export function CollectionImportButton({
  withDialog = true,
  label = 'Import cards',
  variant = 'ghost',
}: {
  withDialog?: boolean
  label?: string
  variant?: 'ghost' | 'outline' | 'default'
}) {
  const open = useImportOpen()

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-[length:var(--fs-sm)]"
      >
        <Upload className="size-3.5" />
        {label}
      </Button>
      {withDialog && <ManaBoxCollectionImportDialog open={open} onOpenChange={setOpen} />}
    </>
  )
}
