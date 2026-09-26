'use client'

import { Checkbox } from '@/components/ui/checkbox'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WishlistCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WishlistCheckbox({
  checked,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: WishlistCheckboxProps) {
  return (
    <label
      className="inline-flex cursor-pointer items-center gap-1.5 text-[length:var(--fs-xs)] text-[var(--text-secondary)] hover:text-foreground"
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        aria-label={ariaLabel ?? 'Add to wishlist'}
        className="data-checked:bg-[var(--status-unowned)] data-checked:border-[var(--status-unowned)]"
      />
      <span className="whitespace-nowrap">Wishlist</span>
    </label>
  )
}
