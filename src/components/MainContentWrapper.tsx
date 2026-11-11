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
      {/* Content area + Oracle footer. `relative` so the chat side panel can sit on the
          right edge, between the headers above and the footer bar below, without resizing the page. */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <main
            id="main-content"
            className="flex flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
          >
            {children}
          </main>
        </div>
        {sidebar}
      </div>
    </div>
  )
}
