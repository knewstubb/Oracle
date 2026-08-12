'use client'

import { Heart } from 'lucide-react'
import { usePageHeader } from '@/contexts/PageHeaderContext'

export default function WishlistPage() {
  // Set page header at layout level
  usePageHeader({
    title: 'Wishlist',
    subtitle: 'Cards you want to acquire',
  })

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Heart className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">Wishlist</h1>
      <p className="text-muted-foreground max-w-md">
        Track cards you want to acquire. Coming soon.
      </p>
    </div>
  )
}
