'use client'

import { PillToggle, type PillToggleOption, type PillToggleTone } from '@/components/ui/pill-toggle'
import type { InstanceState } from '@/types/import-reconciliation'

interface StateButtonGroupProps {
  /** Current state for this instance. */
  value: InstanceState
  /** Available states. Owned = unsleeved/sleeved/proxy; unowned = unsleeved/proxy. */
  options: readonly InstanceState[]
  /** Called when the user selects a new state. */
  onChange: (value: InstanceState) => void
  /** Accessible label describing what this group controls. */
  'aria-label': string
  /** Whether the group is disabled (e.g. while a mutation is pending). */
  disabled?: boolean
  /** Per-option disabled predicate. */
  isOptionDisabled?: (option: InstanceState) => boolean
  /** Tooltip explaining why an option is disabled. */
  disabledReason?: string
}

const STATE_COPY: Record<InstanceState, { label: string; tone: PillToggleTone }> = {
  planned: { label: 'Unsleeved', tone: 'amber' },
  sleeved: { label: 'Sleeved', tone: 'teal' },
  proxy: { label: 'Proxy', tone: 'blue' },
}

export function StateButtonGroup({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  disabled,
  isOptionDisabled,
  disabledReason,
}: StateButtonGroupProps) {
  const toggleOptions: PillToggleOption<InstanceState>[] = options.map((option) => ({
    value: option,
    label: STATE_COPY[option].label,
    tone: STATE_COPY[option].tone,
    disabled: isOptionDisabled?.(option),
    title: disabledReason,
  }))

  return (
    <PillToggle
      options={toggleOptions}
      value={value}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  )
}
