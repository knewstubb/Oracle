'use client'

import { usePageHeaderContext } from '@/contexts/PageHeaderContext'
import { PageHeader } from '@/components/PageHeader'

interface MainContentWrapperProps {
  children: React.ReactNode
}

export function MainContentWrapper({ children }: MainContentWrapperProps) {
  const { config } = usePageHeaderContext()

  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
    >
      {config && (
        <PageHeader
          title={config.title}
          subtitle={config.subtitle}
          actions={config.actions}
        />
      )}
      {children}
    </main>
  )
}
