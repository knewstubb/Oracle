'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ManaBoxCollectionImportDialog } from '@/components/manabox-import/ManaBoxCollectionImportDialog'

export function CollectionImportButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-[length:var(--fs-sm)]"
      >
        <Upload className="size-3.5" />
        Import CSV
      </Button>
      <ManaBoxCollectionImportDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
