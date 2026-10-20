'use client'

import { Checkbox } from '@/components/ui/checkbox'

export interface FoilCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  cardName: string
}

export function FoilCheckbox({ checked, onChange, cardName }: FoilCheckboxProps) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(v) => onChange(v === true)}
      aria-label={`Foil, ${cardName}`}
    />
  )
}
