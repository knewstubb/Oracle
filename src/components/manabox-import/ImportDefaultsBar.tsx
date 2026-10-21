'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import {
  CONDITION_LABELS,
  FINISH_LABELS,
  isImportCondition,
  isImportFinish,
} from '@/lib/import-copies'
import type {
  ImportCondition,
  ImportDefaults,
  ImportFinish,
} from '../../../docs/oracle/contracts/import-row-editing.types'
import { LANGUAGE_LABELS, languageLabel, languageOptions, SELECT_CLASS } from './import-labels'

export interface ImportDefaultsBarProps {
  defaults: ImportDefaults
  onChange: (defaults: ImportDefaults) => void
  /** Deck import only: basic lands count as sleeved and add no copies. */
  basics?: { qty: number; generic: boolean; onChange: (value: boolean) => void }
}

/** "Importing as: Non-foil · Near Mint · English  Change". Values never carry the file dot. */
export function ImportDefaultsBar({ defaults, onChange, basics }: ImportDefaultsBarProps) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2"
      role="group"
      aria-label="Import defaults"
    >
      <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-sm)]">
        <span className="text-muted-foreground">Importing as:</span>
        <span>{FINISH_LABELS[defaults.finish]}</span>
        <span aria-hidden="true" className="text-[var(--text-tertiary)]">·</span>
        <span>{CONDITION_LABELS[defaults.condition]}</span>
        <span aria-hidden="true" className="text-[var(--text-tertiary)]">·</span>
        <span>{languageLabel(defaults.language)}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="import-defaults-edit"
          onClick={() => setOpen((v) => !v)}
          className="text-[length:var(--fs-xs)] underline underline-offset-2 hover:text-foreground"
        >
          {open ? 'Done' : 'Change'}
        </button>
        <span className="ml-auto flex items-center gap-2">
          {basics && basics.qty > 0 ? (
            <label
              className="flex cursor-pointer items-center gap-2 text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground"
              title="Basic lands count as sleeved and add no copies"
            >
              <span id="generic-basics-label">Generic basics</span>
              <Switch
                checked={basics.generic}
                onCheckedChange={basics.onChange}
                aria-labelledby="generic-basics-label"
              />
              <span>{basics.qty}</span>
            </label>
          ) : (
            <span className="text-[length:var(--fs-xs)] text-muted-foreground">
              Values in your file are used automatically where present.
            </span>
          )}
        </span>
      </div>
      {open && (
        <div
          id="import-defaults-edit"
          className="mt-2 flex flex-wrap items-end gap-3 border-t border-[var(--border-subtle)] pt-2"
        >
          <label className="flex flex-col gap-0.5 text-[length:var(--fs-xs)] text-muted-foreground">
            Finish
            <select
              className={SELECT_CLASS}
              value={defaults.finish}
              onChange={(e) => {
                if (isImportFinish(e.target.value)) onChange({ ...defaults, finish: e.target.value as ImportFinish })
              }}
            >
              {Object.entries(FINISH_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[length:var(--fs-xs)] text-muted-foreground">
            Condition
            <select
              className={SELECT_CLASS}
              value={defaults.condition}
              onChange={(e) => {
                if (isImportCondition(e.target.value)) {
                  onChange({ ...defaults, condition: e.target.value as ImportCondition })
                }
              }}
            >
              {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[length:var(--fs-xs)] text-muted-foreground">
            Language
            <select
              className={SELECT_CLASS}
              value={defaults.language}
              onChange={(e) => onChange({ ...defaults, language: e.target.value })}
            >
              {languageOptions(defaults.language).map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABELS[code] ?? code.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <span className="pb-1 text-[length:var(--fs-xs)] text-muted-foreground">
            Applies to copies you haven&apos;t set yourself. Proxies keep only language. Values in your file are used automatically where present.
          </span>
        </div>
      )}
    </div>
  )
}
