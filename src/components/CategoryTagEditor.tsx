'use client'

import { useCallback } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { StructuredCategories } from '@/lib/categoryUtils'
import { MAX_ADDITIONAL_CATEGORIES } from '@/lib/categoryUtils'

export interface CategoryTagEditorProps {
  primaryCategory: string
  additionalCategories: string[]
  availableCategories: string[]
  onChange: (updated: StructuredCategories) => void
  disabled?: boolean
}

/**
 * Reusable category tag editor widget for secondary category assignment.
 *
 * Renders the primary category as a read-only badge and one dropdown for
 * each extra category (up to 4), plus one empty dropdown while there is room.
 * Each dropdown excludes the primary category and the other dropdowns'
 * current selections from its options.
 *
 * Enforces the 5-category hard cap structurally (at most 4 dropdowns exist).
 */
export function CategoryTagEditor({
  primaryCategory,
  additionalCategories,
  availableCategories,
  onChange,
  disabled = false,
}: CategoryTagEditorProps) {
  // One dropdown for each extra category the card holds, plus one empty one while there is room (5 categories in all).
  const slotCount = Math.min(MAX_ADDITIONAL_CATEGORIES, additionalCategories.length + 1)
  const slots = Array.from({ length: slotCount }, (_, i) => additionalCategories[i] ?? '')
  const getOptionsForSlot = useCallback(
    (slot: number) =>
      availableCategories.filter(
        (cat) => cat !== primaryCategory && !slots.some((v, i) => i !== slot && v === cat)
      ),
    [availableCategories, primaryCategory, slots]
  )
  const handleChange = useCallback(
    (slot: number, value: string) => {
      const next = slots.map((v, i) => (i === slot ? value : v)).filter(Boolean)
      onChange({ primary_category: primaryCategory, additional_categories: next })
    },
    [primaryCategory, slots, onChange]
  )
  return (
    <div className="flex flex-col gap-2" data-testid="category-tag-editor">
      {/* Primary category — read-only badge */}
      <div className="flex items-center gap-2">
        <span className="text-[length:var(--fs-sm)] text-muted-foreground w-16 shrink-0">Primary:</span>
        <Badge variant="secondary" data-testid="primary-category-badge" className="h-auto max-w-full whitespace-normal break-words">
          {primaryCategory}
        </Badge>
      </div>
      {/* Extra category dropdowns. Names are shown whole (up to 60 characters). */}
      {slots.map((value, i) => (
        <SecondaryDropdown
          key={i}
          label={`Secondary ${i + 1}:`}
          value={value}
          options={getOptionsForSlot(i)}
          disabled={disabled}
          onChange={(val) => handleChange(i, val)}
          onClear={() => handleChange(i, '')}
          testId={`secondary-${i + 1}`}
        />
      ))}
    </div>
  )
}

interface SecondaryDropdownProps {
  label: string
  value: string
  options: string[]
  disabled: boolean
  onChange: (value: string) => void
  onClear: () => void
  testId: string
}

function SecondaryDropdown({
  label,
  value,
  options,
  disabled,
  onChange,
  onClear,
  testId,
}: SecondaryDropdownProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[length:var(--fs-sm)] text-muted-foreground w-16 shrink-0">{label}</span>
      <select
        data-testid={`${testId}-select`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-7 flex-1 rounded-md border border-input bg-background px-2 text-[length:var(--fs-sm)]',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        aria-label={label.replace(':', '')}
      >
        <option value="">None</option>
        {(value && !options.includes(value) ? [value, ...options] : options).map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          onClick={onClear}
          aria-label={`Clear ${label.replace(':', '')}`}
          data-testid={`${testId}-clear`}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  )
}
