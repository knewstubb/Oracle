/**
 * Material Symbols icon wrapper component.
 * Uses the Material Symbols Outlined font loaded in app/layout.tsx.
 * 
 * Icon names: https://fonts.google.com/icons?icon.set=Material+Symbols
 */

interface MaterialIconProps {
  /** Material Symbols icon name (e.g., 'crown', 'grid_view', 'settings') */
  name: string
  /** Optional className for sizing and styling */
  className?: string
  /** Whether the icon should be filled (default: false) */
  filled?: boolean
}

export function MaterialIcon({ name, className = '', filled = false }: MaterialIconProps) {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={{
        fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0",
      }}
    >
      {name}
    </span>
  )
}
