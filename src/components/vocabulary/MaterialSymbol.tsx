'use client'

import { cn } from '@/lib/utils'

export interface MaterialSymbolProps {
  name: string
  filled?: boolean
  className?: string
  style?: React.CSSProperties
  'aria-hidden'?: boolean | 'true' | 'false'
}

/**
 * Renders a Google Material Symbol icon using the project's icon font.
 *
 * Every vocabulary badge uses Material Symbols so that words, colours and
 * icons stay consistent across screens (D-043).
 */
export function MaterialSymbol({
  name,
  filled = false,
  className,
  style,
  'aria-hidden': ariaHidden = true,
}: MaterialSymbolProps) {
  return (
    <span
      className={cn(
        'material-symbols-outlined inline-flex items-center justify-center',
        className
      )}
      style={{
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'opsz' 20`,
        fontSize: '14px',
        width: '14px',
        height: '14px',
        lineHeight: '14px',
        ...style,
      }}
      aria-hidden={ariaHidden}
    >
      {name}
    </span>
  )
}
