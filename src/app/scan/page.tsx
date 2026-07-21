'use client'

import { ScanSession } from '@/components/scanner/ScanSession'
import { PageHeader } from '@/components/PageHeader'

export default function ScanPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Scan Cards"
        subtitle="Add cards to your collection using your camera"
      />
      <div className="flex-1 overflow-hidden">
        <ScanSession />
      </div>
    </div>
  )
}
