'use client'

export interface GenericLandBadgeProps {
  landType: string
  artUrl?: string | null
  className?: string
}

/**
 * Visual badge/indicator overlay distinguishing generic land slots
 * from ownership-tracked slots. Generic slots represent "a basic land
 * of this type" without referencing any physical copy.
 */
export function GenericLandBadge({ landType, artUrl, className }: GenericLandBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 ${className ?? ''}`}
      aria-label={`Generic land: ${landType}`}
    >
      <span aria-hidden="true" className="text-[10px]">G</span>
      {artUrl ? (
        <img
          src={artUrl}
          alt=""
          className="h-3 w-3 rounded-sm object-cover"
          aria-hidden="true"
        />
      ) : null}
      {landType}
    </span>
  )
}
