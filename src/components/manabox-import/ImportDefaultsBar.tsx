'use client'

import { useState } from 'react'
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
  /**
   * Deck import only: the "Ignore basic lands" switch. On: the five basics and Wastes are never taken from
   * other decks (they need no source). `count` = how many such basics the file lists (shown while on).
   */
  ignoreBasics?: { on: boolean; count: number; onChange: (on: boolean) => void }
}

/** "Importing as: Non-foil · Near Mint · English  Change". Values never carry the file dot. */
export function ImportDefaultsBar({ defaults, onChange, ignoreBasics }: ImportDefaultsBarProps) {
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
        {ignoreBasics ? (
          <span className="ml-auto flex items-center gap-2">
            {ignoreBasics.on && ignoreBasics.count > 0 && (
              <span className="text-[length:var(--fs-xs)] text-muted-foreground">
                {ignoreBasics.count} {ignoreBasics.count === 1 ? 'basic' : 'basics'}
              </span>
            )}
            <label className="inline-flex min-h-6 cursor-pointer items-center gap-1.5 text-[length:var(--fs-xs)]">
              <button
                type="button"
                role="switch"
                aria-checked={ignoreBasics.on}
                aria-label="Ignore basic lands"
                onClick={() => ignoreBasics.onChange(!ignoreBasics.on)}
                className={`relative inline-block h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] ${ignoreBasics.on ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-default)]'}`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${ignoreBasics.on ? 'left-[14px]' : 'left-0.5'}`}
                />
              </button>
              Ignore basic lands
            </label>
          </span>
        ) : (
          <span className="ml-auto text-[length:var(--fs-xs)] text-muted-foreground">
            Values in your file are used automatically where present.
          </span>
        )}
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
            Applies to new copies only. Copies from your collection keep their own. Proxies keep only language. Values in your file are used automatically where present.
          </span>
        </div>
      )}
    </div>
  )
}
