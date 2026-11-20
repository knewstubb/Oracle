import { cn } from '@/lib/utils'
import { MANA_FILL_VARS, MANA_NAMES, type ManaLetter } from '@/lib/ui-tokens'

/**
 * One coloured mana symbol for cost and colour identity. Same mana-font classes as ManaCost
 * (`ms ms-w ms-cost`, loaded from app/layout.tsx), with the fill taken from the shared mana tokens.
 * Pass `label={false}` when the surrounding text already names the colour.
 */
export function ManaSymbol({ colour, className, label = true }: { colour: ManaLetter; className?: string; label?: boolean }) {
  const key = colour.toLowerCase()
  return (
    <i
      className={cn(`ms ms-${key} ms-cost`, className)}
      style={{ color: `var(${MANA_FILL_VARS[colour]})` }}
      {...(label ? { role: 'img', 'aria-label': MANA_NAMES[colour] } : { 'aria-hidden': true })}
      data-mana={colour}
    />
  )
}
