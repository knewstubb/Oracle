'use client'

import { Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { usePageHeader } from '@/contexts/PageHeaderContext'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConnectionTab } from '@/components/connector/ConnectionTab'
import { RecentChangesTab } from '@/components/connector/RecentChangesTab'
import { SetupGuideTab } from '@/components/connector/SetupGuideTab'

const TABS = ['connection', 'changes', 'guide'] as const
type TabKey = (typeof TABS)[number]

function ClaudeConnectorContent() {
  usePageHeader({ title: 'Claude connector', subtitle: 'Settings' })
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const raw = params.get('tab')
  const tab: TabKey = (TABS as readonly string[]).includes(raw ?? '') ? (raw as TabKey) : 'connection'

  const go = (next: TabKey) => router.replace(`${pathname}?tab=${next}`, { scroll: false })

  return (
    <div className="mx-auto w-full max-w-[var(--content-max-width)] overflow-y-auto px-4 py-6 sm:px-8">
      <Tabs value={tab} onValueChange={(v) => go(v as TabKey)}>
        <div className="max-w-full overflow-x-auto">
          <TabsList variant="line" className="h-auto min-w-max">
            <TabsTrigger value="connection" className="min-h-[44px] px-4">Connection</TabsTrigger>
            <TabsTrigger value="changes" className="min-h-[44px] px-4">Recent changes</TabsTrigger>
            <TabsTrigger value="guide" className="min-h-[44px] px-4">Setup guide</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="connection" className="pt-4"><ConnectionTab onShowGuide={() => go('guide')} /></TabsContent>
        <TabsContent value="changes" className="pt-4"><RecentChangesTab /></TabsContent>
        <TabsContent value="guide" className="pt-4"><SetupGuideTab /></TabsContent>
      </Tabs>
    </div>
  )
}

export default function ClaudeConnectorPage() {
  return (
    <Suspense fallback={null}>
      <ClaudeConnectorContent />
    </Suspense>
  )
}
