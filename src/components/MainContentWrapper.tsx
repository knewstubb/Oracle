'use client'

import { useOracle } from '@/contexts/OracleContext'

interface MainContentWrapperProps {
  children: React.ReactNode
}

export function MainContentWrapper({ children }: MainContentWrapperProps) {
  const { isOpen } = useOracle()

  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
      style={{
        // Don't need margin — sidebar is in the flex flow on desktop
        // Mobile uses overlay so no adjustment needed
      }}
    >
      {children}
    </main>
  )
}
