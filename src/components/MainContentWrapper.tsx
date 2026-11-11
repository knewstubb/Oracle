'use client'

import { usePageHeaderContext } from '@/contexts/PageHeaderContext'
import { PageHeader } from '@/components/PageHeader'

interface MainContentWrapperProps {
  children: React.ReactNode
  sidebar?: React.ReactNode
}

export function MainContentWrapper({ children, sidebar }: MainContentWrapperProps) {
  const { config } = usePageHeaderContext()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* PageHeader renders at the top, above both content and sidebar */}
      {config && (
        <PageHeader
          title={config.title}
          subtitle={config.subtitle}
          actions={config.actions}
        />
      )}
      {/* Page row: content on the left, Oracle chat panel on the right. The panel is rendered into
          #oracle-panel-slot by OracleSidebar; when it is open the content narrows to make room. */}
      <div className="relative flex flex-1 overflow-hidden">
        <main
          id="main-content"
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
        >
          {children}
        </main>
        <div id="oracle-panel-slot" className="contents" />
      </div>
      {/* App footer, one bar on every page, full width beneath the content AND the chat panel.
          Left: page-specific footer content (e.g. deck health pills, rendered into #app-footer-left).
          Right/remaining space: the Oracle chat input. */}
      <footer
        data-testid="app-footer"
        className="relative z-30 flex shrink-0 items-center gap-3 border-t px-6 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        style={{ borderColor: 'var(--border-default)', backgroundColor: 'rgba(255,255,255,0.02)' }}
      >
        <div id="app-footer-left" className="flex min-w-0 max-w-full shrink items-center gap-2 overflow-x-auto" />
        {sidebar}
      </footer>
    </div>
  )
}
