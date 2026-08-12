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
      {/* Content area with sidebar — flex row */}
      <div className="flex flex-1 overflow-hidden">
        <main
          id="main-content"
          className="flex flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
        >
          {children}
        </main>
        {sidebar}
      </div>
    </div>
  )
}
