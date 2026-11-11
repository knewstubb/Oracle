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
      {/* Page row: page header + content on the left, Oracle chat panel on the right. The panel is
          rendered into #oracle-panel-slot by OracleSidebar; it starts just below the top bar on
          every page, and when open the content (and page header) narrows to make room. */}
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {config && (
            <PageHeader
              title={config.title}
              subtitle={config.subtitle}
              actions={config.actions}
            />
          )}
          <main
            id="main-content"
            className="flex min-w-0 flex-1 flex-col overflow-hidden"
          >
            {children}
          </main>
        </div>
        <div id="oracle-panel-slot" className="contents" />
      </div>
      {/* App footer, full width beneath the content AND the chat panel. Pages render their footer
          content into #app-footer (e.g. deck health pills). Hidden when empty (no extra bar). */}
      <footer
        id="app-footer"
        data-testid="app-footer"
        className="relative z-30 flex shrink-0 items-center gap-3 overflow-x-auto border-t px-6 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] empty:hidden"
        style={{ borderColor: 'var(--border-default)', backgroundColor: 'rgba(255,255,255,0.02)' }}
      />
      {sidebar}
    </div>
  )
}
