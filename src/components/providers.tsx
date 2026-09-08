'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { OracleProvider } from '@/contexts/OracleContext'
import { PageHeaderProvider } from '@/contexts/PageHeaderContext'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 min — consider data fresh
            gcTime: 60 * 60 * 1000, // 1 hour — keep in cache much longer
            retry: 1,
            refetchOnWindowFocus: false, // Don't refetch when tab becomes active
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
        <TooltipProvider>
          <OracleProvider>
            <PageHeaderProvider>
              {children}
            </PageHeaderProvider>
          </OracleProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
