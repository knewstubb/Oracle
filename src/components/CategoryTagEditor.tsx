'use client'

import { useCallback } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { StructuredCategories } from '@/lib/categoryUtils'
import { MAX_CATEGORY_LENGTH } from '@/lib/categoryUtils'

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
 * Renders the primary category as a read-only badge and two secondary
 * category dropdowns. Each dropdown excludes the primary category and
 * the other dropdown's current selection from its options.
 *
 * Enforces the 3-category hard cap structurally (only 2 dropdowns exist).
 */
export function CategoryTagEditor({
  primaryCategory,
  additionalCategories,
  availableCategories,
  onChange,
  disabled = false,
}: CategoryTagEditorProps) {
  const secondary1 = additionalCategories[0] ?? ''
  const secondary2 = additionalCategories[1] ?? ''

  const getOptionsForSlot = useCallback(
    (slot: 1 | 2) => {
      const otherValue = slot === 1 ? secondary2 : secondary1
      return availableCategories.filter(
        (cat) => cat !== primaryCategory && cat !== otherValue
      )
    },
    [availableCategories, primaryCategory, secondary1, secondary2]
  )

  const handleChange = useCallback(
    (slot: 1 | 2, value: string) => {
      const newSecondary1 = slot === 1 ? value : secondary1
      const newSecondary2 = slot === 2 ? value : secondary2
      const additional = [newSecondary1, newSecondary2].filter(Boolean)
      onChange({ primary_category: primaryCategory, additional_categories: additional })
    },
    [primaryCategory, secondary1, secondary2, onChange]
  )

  const handleClear = useCallback(
    (slot: 1 | 2) => {
      handleChange(slot, '')
    },
    [handleChange]
  )

  return (
    <div className="flex flex-col gap-2" data-testid="category-tag-editor">
      {/* Primary category — read-only badge */}
      <div className="flex items-center gap-2">
        <span className="text-[length:var(--fs-sm)] text-muted-foreground w-16 shrink-0">Primary:</span>
        <Badge variant="secondary" data-testid="primary-category-badge">
          {primaryCategory}
        </Badge>
      </div>

      {/* Secondary category dropdowns.
         Note: MAX_CATEGORY_LENGTH (16) enforced upstream in parseCategoriesCapped and useDeckCategories.
         If these are replaced with free-text inputs in the future, apply maxLength={MAX_CATEGORY_LENGTH}. */}

      {/* Secondary 1 dropdown */}
      <SecondaryDropdown
        label="Secondary 1:"
        value={secondary1}
        options={getOptionsForSlot(1)}
        disabled={disabled}
        onChange={(val) => handleChange(1, val)}
        onClear={() => handleClear(1)}
        testId="secondary-1"
      />

      {/* Secondary 2 dropdown */}
      <SecondaryDropdown
        label="Secondary 2:"
        value={secondary2}
        options={getOptionsForSlot(2)}
        disabled={disabled}
        onChange={(val) => handleChange(2, val)}
        onClear={() => handleClear(2)}
        testId="secondary-2"
      />
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
        {options.map((cat) => (
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
