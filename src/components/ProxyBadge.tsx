'use client'

import { Badge } from '@/components/ui/badge'

interface ProxyBadgeProps {
  className?: string
}

export function ProxyBadge({ className }: ProxyBadgeProps) {
  return (
    <Badge
      className={className}
      style={{ backgroundColor: '#e158ff', color: '#fff', borderColor: '#e158ff' }}
    >
      Proxy
    </Badge>
  )
}
