'use client'

export interface GenericLandBadgeProps {
  landType: string
  className?: string
}

/**
 * Visual badge/indicator overlay distinguishing generic land slots
 * from ownership-tracked slots. Generic slots represent "a basic land
 * of this type" without referencing any physical copy.
 */
export function GenericLandBadge({ landType, className }: GenericLandBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-sm)] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 ${className ?? ''}`}
      aria-label={`Generic land: ${landType}`}
    >
      <span aria-hidden="true" className="text-[length:var(--fs-xs)]">G</span>
      {landType}
    </span>
  )
}
