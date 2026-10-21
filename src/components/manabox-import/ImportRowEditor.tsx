'use client'

import { Check, VenetianMask, ChevronsDown, ChevronDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import {
  CONDITION_LABELS,
  CONDITION_SHORT_LABELS,
  FINISH_LABELS,
  finishControlState,
  summariseRowTags,
  tagDisplayText,
  visibleFields,
  type ResolvedImportCopy,
} from '@/lib/import-copies'
import type {
  ImportCondition,
  ImportCopyOwnerEdits,
  ImportDefaults,
  ImportFinish,
  ImportRow,
  ImportCopyType,
} from '../../../docs/oracle/contracts/import-row-editing.types'
import { languageLabel, SELECT_CLASS } from './import-labels'
import { languageChoices, type LanguageLookup } from '@/lib/printing-languages'
import { usePrintingLanguages } from './use-printing-languages'

const TYPE_STYLE: Record<ImportCopyType, { label: string; selected: string }> = {
  original: {
    label: 'Original',
    selected: 'bg-[rgba(29,158,117,0.18)] shadow-[inset_0_0_0_1px_var(--accent-primary)] text-foreground',
  },
  proxy: {
    label: 'Proxy',
    selected: 'bg-[rgba(74,147,160,0.18)] shadow-[inset_0_0_0_1px_var(--status-proxy)] text-foreground',
  },
  unsleeved: {
    label: 'Unsleeved',
    selected: 'shadow-[inset_0_0_0_1px_var(--text-secondary)] text-foreground',
  },
}

/** Segmented Original / Proxy (/ Unsleeved) control. Shared by copy lines and the bulk bar. */
export function TypeToggle({
  value,
  options,
  onChange,
  label,
}: {
  /** `mixed` presses nothing. */
  value: ImportCopyType | 'mixed'
  options: ImportCopyType[]
  onChange: (type: ImportCopyType) => void
  label: string
}) {
  return (
    <span
      role="group"
      aria-label={label}
      className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full border border-[var(--border-default)] p-0.5"
    >
      {options.map((type) => {
        const pressed = value === type
        return (
          <button
            key={type}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(type)}
            className={cn(
              'inline-flex h-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[length:var(--fs-xs)] text-muted-foreground hover:bg-[var(--bg-surface-hover)]',
              pressed && TYPE_STYLE[type].selected
            )}
          >
            {type === 'original' && <Check className="size-3 text-[var(--accent-primary)]" aria-hidden="true" />}
            {type === 'proxy' && <VenetianMask className="size-3 text-[var(--status-proxy)]" aria-hidden="true" />}
            {TYPE_STYLE[type].label}
          </button>
        )
      })}
    </span>
  )
}

/** Wraps a field; a small dot marks a value that came from the file. */
function FieldWithDot({ fromFile, children }: { fromFile: boolean; children: React.ReactNode }) {
  if (!fromFile) return <>{children}</>
  return (
    <span className="relative inline-block shrink-0" title="From your file" data-from-file="true">
      {children}
      <span
        aria-hidden="true"
        data-testid="file-dot"
        className="pointer-events-none absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-foreground shadow-[0_0_0_2px_var(--bg-surface-hover)]"
      />
    </span>
  )
}

export interface ImportRowEditorProps {
  row: ImportRow
  resolved: ResolvedImportCopy[]
  kind: 'collection' | 'deck'
  defaults: ImportDefaults
  open: boolean
  selected: boolean
  /** Generic basic land on a deck import: shown as "Basic", not editable (D-048). */
  generic: boolean
  onToggleOpen: () => void
  onToggleSelect: (checked: boolean) => void
  onChangeCopy: (index: number, patch: ImportCopyOwnerEdits) => void
  onApplyAll: () => void
}

export function ImportRowEditor({
  row,
  resolved,
  kind,
  defaults,
  open,
  selected,
  generic,
  onToggleOpen,
  onToggleSelect,
  onChangeCopy,
  onApplyAll,
}: ImportRowEditorProps) {
  const summary = summariseRowTags(resolved, defaults)
  const tagText = [
    ...summary.tags.map(tagDisplayText),
    ...(summary.overflow > 0 ? [`${summary.overflow} more`] : []),
  ]
  const typeOptions: ImportCopyType[] = kind === 'deck' ? ['original', 'proxy', 'unsleeved'] : ['original', 'proxy']
  // Languages are looked up once, the first time the row is opened.
  const languageLookup = usePrintingLanguages(row.setCode, row.collectorNumber, open && !generic)
  const fileLanguages = row.copies.map((c) => c.file.language).filter((l): l is string => !!l)

  return (
    <div
      data-row-key={row.rowKey}
      className={cn(
        'border-b border-[var(--border-subtle)]',
        open && 'bg-[var(--bg-surface-hover)] shadow-[inset_2px_0_0_var(--text-secondary)]'
      )}
    >
      <div
        data-row-header
        onClick={
          generic
            ? undefined
            : (e) => {
                // Clicks on the checkbox or Edit button do their own job.
                if ((e.target as HTMLElement).closest('button,input,label,[role="checkbox"]')) return
                onToggleOpen()
              }
        }
        className={cn(
          'group grid min-h-[34px] grid-cols-[24px_28px_1fr_auto] items-center gap-2 px-2.5 hover:bg-[var(--bg-surface-hover)]',
          !generic && 'cursor-pointer'
        )}
      >
        {generic ? (
          <span />
        ) : (
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onToggleSelect(v === true)}
            aria-label={`Select ${row.cardName}`}
          />
        )}
        <span className="text-[length:var(--fs-xs)] tabular-nums text-muted-foreground">{row.qty}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 py-1 text-[length:var(--fs-xs)]">
          <span className="truncate text-foreground">{row.cardName}</span>
          <span className="text-muted-foreground">
            {row.setCode} {row.collectorNumber}
          </span>
          {!generic && !open && (
            <>
              {summary.tags.map((tag) => (
                <span
                  key={`${tag.kind}-${tag.label}`}
                  data-tag={tag.kind}
                  className={cn(
                    'inline-flex h-[18px] items-center gap-0.5 rounded-full border px-1.5 text-[length:var(--fs-xs)] text-muted-foreground',
                    tag.label === 'Proxy'
                      ? 'border-[var(--status-proxy)] text-[var(--status-proxy)]'
                      : 'border-[var(--border-default)]'
                  )}
                >
                  {tag.label === 'Proxy' && <span aria-hidden="true">◆</span>}
                  {tag.label === 'Foil' && <span aria-hidden="true">★</span>}
                  {tag.label === 'Etched' && <span aria-hidden="true">✦</span>}
                  {tagDisplayText(tag)}
                </span>
              ))}
              {summary.overflow > 0 && (
                <span
                  title="Press Edit to see all"
                  className="inline-flex h-[18px] items-center rounded-full border border-[var(--border-default)] px-1.5 text-[length:var(--fs-xs)] text-muted-foreground"
                >
                  +{summary.overflow} more
                </span>
              )}
              <span className="sr-only">
                {tagText.length > 0 ? `Differs from defaults: ${tagText.join(', ')}` : 'Uses defaults'}
              </span>
            </>
          )}
        </span>
        {generic ? (
          <span className="inline-flex h-5 items-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-hover)] px-2 text-[length:var(--fs-xs)] text-muted-foreground">
            Basic
          </span>
        ) : (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Edit'} ${row.cardName}`}
            onClick={onToggleOpen}
            title={open ? 'Collapse' : 'Edit copies'}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] group-hover:text-foreground"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4 transition-transform', open && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {open && !generic && (
        <div className="flex flex-col pb-2 pl-[62px] pr-2.5">
          {resolved.map((copy, position) => (
            <CopyLine
              key={copy.index}
              row={row}
              copy={copy}
              position={position}
              total={resolved.length}
              typeOptions={typeOptions}
              languageLookup={languageLookup}
              fileLanguages={fileLanguages}
              onChange={(patch) => onChangeCopy(copy.index, patch)}
              onApplyAll={position === 0 && resolved.length > 1 ? onApplyAll : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CopyLine({
  row,
  copy,
  position,
  total,
  typeOptions,
  languageLookup,
  fileLanguages,
  onChange,
  onApplyAll,
}: {
  row: ImportRow
  copy: ResolvedImportCopy
  position: number
  total: number
  typeOptions: ImportCopyType[]
  languageLookup: LanguageLookup
  fileLanguages: string[]
  onChange: (patch: ImportCopyOwnerEdits) => void
  onApplyAll?: () => void
}) {
  const n = position + 1
  const visible = visibleFields(copy.type)
  const finishState = finishControlState(row.availableFinishes, copy.finish, copy.sources.finish)
  const showFinish = visible.finish && finishState.mode === 'select'
  const languages = languageChoices(languageLookup, fileLanguages, copy.language)
  const fromFile = (source: string) => source === 'file'
  const suffix = (source: string) => (fromFile(source) ? ' (from your file)' : '')

  return (
    <div
      role="group"
      aria-label={`Copy ${n} of ${total}`}
      className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] py-1 first:border-t-0"
    >
      <span className="w-4 shrink-0 text-[length:var(--fs-xs)] tabular-nums text-[var(--text-tertiary)]">{n}</span>
      <TypeToggle
        value={copy.type}
        options={typeOptions}
        label={`Copy ${n} type`}
        onChange={(type) => onChange({ type })}
      />
      {visible.language && languages.mode !== 'hidden' && (
        <FieldWithDot fromFile={fromFile(copy.sources.language)}>
          <select
            className={SELECT_CLASS}
            aria-label={`Copy ${n} language${suffix(copy.sources.language)}`}
            value={copy.language}
            disabled={languages.mode === 'loading'}
            aria-busy={languages.mode === 'loading'}
            onChange={(e) => onChange({ language: e.target.value })}
          >
            {languages.mode === 'loading' && <option value={copy.language}>Loading…</option>}
            {languages.mode !== 'loading' &&
              languages.codes.map((code) => (
                <option key={code} value={code}>
                  {languageLabel(code)}
                </option>
              ))}
          </select>
        </FieldWithDot>
      )}
      {showFinish && (
        <FieldWithDot fromFile={fromFile(copy.sources.finish)}>
          <select
            className={SELECT_CLASS}
            aria-label={`Copy ${n} finish${suffix(copy.sources.finish)}`}
            value={copy.finish}
            onChange={(e) => onChange({ finish: e.target.value as ImportFinish })}
          >
            {finishState.options.map((option) => (
              <option key={option.value} value={option.value}>
                {FINISH_LABELS[option.value]}
                {option.unlisted ? ' — not listed by Scryfall' : ''}
              </option>
            ))}
          </select>
        </FieldWithDot>
      )}
      {visible.finish && copy.finishNote === 'unlisted' && (
        <span className="text-[length:var(--fs-xs)] text-[var(--signal-warning)]">not listed by Scryfall</span>
      )}
      {visible.condition && (
        <FieldWithDot fromFile={fromFile(copy.sources.condition)}>
          <select
            className={SELECT_CLASS}
            aria-label={`Copy ${n} condition${suffix(copy.sources.condition)}`}
            value={copy.heldCondition}
            onChange={(e) => onChange({ condition: e.target.value as ImportCondition })}
          >
            {Object.entries(CONDITION_SHORT_LABELS).map(([value, label]) => (
              <option key={value} value={value} title={CONDITION_LABELS[value as ImportCondition]}>
                {label}
              </option>
            ))}
          </select>
        </FieldWithDot>
      )}
      {onApplyAll && (
        <button
          type="button"
          onClick={onApplyAll}
          aria-label="Make all copies like copy 1"
          title="Make all copies like copy 1"
          className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--bg-surface-hover)] hover:text-foreground"
        >
          <ChevronsDown className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
