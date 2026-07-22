'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function CollectionExportButton() {
  const [isExporting, setIsExporting] = useState(false)

  async function handleExport() {
    setIsExporting(true)
    try {
      const res = await fetch('/api/collection/export')
      if (!res.ok) {
        toast.error('Export failed')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
        ?? `oracle-collection-${new Date().toISOString().split('T')[0]}.csv`

      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('Collection exported')
    } catch {
      toast.error('Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
      className="text-[length:var(--fs-md)]"
    >
      <Download className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export'}</span>
    </Button>
  )
}
