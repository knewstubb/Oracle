"use client";

import {
  Check,
  VenetianMask,
  ChevronsDown,
  ChevronDown,
  Info,
} from "lucide-react";
import { useState } from "react";
import { GenericArtPicker } from "@/components/GenericArtPicker";
import { useCardHoverPreview } from "@/components/CardHoverPreview";
import { getBasicLandDefaultScryfallId } from "@/lib/basic-lands";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  CONDITION_LABELS,
  CONDITION_SHORT_LABELS,
  FINISH_LABELS,
  finishControlState,
  summariseRowTags,
  tagDisplayText,
  visibleFields,
  type ResolvedImportCopy,
} from "@/lib/import-copies";
import type {
  ImportCondition,
  ImportCopyOwnerEdits,
  ImportDefaults,
  ImportFinish,
  ImportRow,
  ImportCopyType,
} from "../../../docs/oracle/contracts/import-row-editing.types";
import { languageLabel, LANGUAGE_LABELS, SELECT_CLASS } from "./import-labels";
import { languageChoices, type LanguageLookup } from "@/lib/printing-languages";
import { usePrintingLanguages } from "./use-printing-languages";
import type {
  IntentChange,
  IntentCopyView,
} from "@/lib/import-intent";
import type { CardSource } from "../../../docs/oracle/contracts/import-intent.types";
import {
  ADD_WAITING_TITLE,
  MAYBEBOARD_NOT_ADDED,
  NO_COLLECTION_TITLE,
  NO_ORIGINAL_TITLE,
  NO_PROXY_TITLE,
  PICK_SOURCE_FIRST_TITLE,
  ORIGIN_OPTION_TEXT,
  TYPE_OPTION_TEXT,
  GENERIC_ORIGIN_TEXT,
  originNoneLabel,
  STATUS_BASIC,
  STATUS_OWNED,
  STATUS_UNOWNED,
} from "./import-copy";

/** Per-card Card source and Type controls. Present only for deck imports with an intent. */
export interface IntentRowControls {
  /** Empty for maybeboard rows (never added or sleeved). */
  views: IntentCopyView[];
  /** The ownership check has not finished: the controls wait. */
  busy: boolean;
  onChange: (index: number, change: IntentChange) => void;
  /** The collapsed row's controls: every copy at once. */
  onChangeRow: (change: IntentChange) => void;
  /** Planned decks: no tags until the owner changes something. */
  quiet?: boolean;
}

/** Columns of the review list; the list header uses the same. */
export const ROW_GRID = "grid-cols-[24px_28px_1fr_auto]";
export const ROW_GRID_INTENT = "grid-cols-[24px_28px_1fr_150px_90px_28px]";
/** Planned decks: one plain Status column, no Type column. */
export const ROW_GRID_PLANNED = "grid-cols-[24px_28px_1fr_110px_28px]";

const SOURCE_OPTIONS: CardSource[] = ["none", "collection", "new"];
const SLEEVED_TYPES: ("original" | "proxy")[] = ["original", "proxy"];

/** One value when every copy agrees, else "mixed" (nothing pressed). Short copies don't count. */
function common<T extends string>(values: (T | null)[]): T | "mixed" {
  const set = new Set(values.filter((v): v is T => v !== null));
  return set.size === 1 ? [...set][0] : "mixed";
}

function sourceReasons(
  views: IntentCopyView[],
  busy: boolean,
): Partial<Record<CardSource, string>> {
  if (busy) {
    return {
      none: ADD_WAITING_TITLE,
      collection: ADD_WAITING_TITLE,
      new: ADD_WAITING_TITLE,
    };
  }
  return views.some((v) => v.canCollection)
    ? {}
    : { collection: NO_COLLECTION_TITLE };
}

function typeReasonsFor(
  views: IntentCopyView[],
  busy: boolean,
): Partial<Record<ImportCopyType, string>> {
  if (busy) return { original: ADD_WAITING_TITLE, proxy: ADD_WAITING_TITLE };
  const live = views.filter(
    (v) => v.source === "collection" || v.source === "new",
  );
  if (live.length === 0) {
    return {
      original: PICK_SOURCE_FIRST_TITLE,
      proxy: PICK_SOURCE_FIRST_TITLE,
    };
  }
  if (live.every((v) => v.source === "collection")) {
    return { original: OWNED_TYPE_TITLE, proxy: OWNED_TYPE_TITLE };
  }
  const out: Partial<Record<ImportCopyType, string>> = {};
  if (!live.some((v) => v.canOriginal)) out.original = NO_ORIGINAL_TITLE;
  if (!live.some((v) => v.canProxy)) out.proxy = NO_PROXY_TITLE;
  return out;
}

const OWNED_TYPE_TITLE = "A copy from your collection keeps its own type";

/** "Choose source" for one From-collection copy: a spare copy, or take it from a deck that holds it. */
function PullSelect({
  view,
  cardName,
  n,
  onChange,
}: {
  view: IntentCopyView;
  cardName: string;
  n: number;
  onChange: (change: IntentChange) => void;
}) {
  const pull = view.pull;
  if (!pull) return null;
  type Key = "none" | "spare" | `deck:${number}`;
  const value: Key =
    pull.pick === "spare" ? "spare" : pull.pick === "deck" && pull.deckId !== undefined ? `deck:${pull.deckId}` : "none";
  const options: QuietOption<Key>[] = [
    { value: "none", label: "Choose source", description: "Nothing is taken until you pick" },
    ...(pull.options.spare
      ? [{ value: "spare" as Key, label: "Spare copy (not in a deck)", description: "Uses a copy that is free" }]
      : []),
    ...pull.options.decks.map((d) => ({
      value: `deck:${d.deckId}` as Key,
      label: `Take from ${d.deckName}`,
      description: "Moves the copy here; that deck keeps the card as not in deck",
    })),
  ];
  const display =
    pull.pick === "spare"
      ? "Spare copy"
      : pull.pick === "deck"
        ? `From ${pull.deckName}`
        : pull.pick === "short"
          ? "None left"
          : "Choose source";
  return (
    <span className={view.needsSource ? "flex items-center text-[var(--signal-warning)]" : "flex items-center"}>
      <QuietSelect<Key>
        value={value}
        display={display}
        options={options}
        label={`Copy ${n} source for ${cardName}`}
        onChange={(v) =>
          onChange({
            pick: v === "none" ? { kind: "none" } : v === "spare" ? { kind: "spare" } : { kind: "deck", deckId: Number(v.slice(5)) },
          })
        }
      />
    </span>
  );
}

interface QuietOption<T extends string> {
  value: T;
  label: string;
  description: string;
  /** Can't be chosen now: stays in the menu, greyed, with this as its description. */
  reason?: string;
}

/** Quiet dropdown: plain text and a small ▾, outlined on hover/focus, only as wide as its text. */
export function QuietSelect<T extends string>({
  value,
  display,
  options,
  label,
  title,
  onChange,
}: {
  /** The chosen option; "mixed" marks none as chosen. */
  value: T | "mixed";
  display: string;
  options: QuietOption<T>[];
  label: string;
  title?: string;
  onChange: (v: T) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={title}
        className="inline-flex h-6 max-w-full shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-transparent px-1.5 text-[length:var(--fs-xs)] text-foreground hover:border-[var(--border-default)] focus-visible:border-[var(--border-default)] focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] data-[popup-open]:border-[var(--border-default)]"
      >
        {display}
        <span aria-hidden="true" className="text-[10px] text-muted-foreground">
          ▾
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64"
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((o) => (
          <DropdownMenuItem
            key={o.value}
            disabled={o.reason !== undefined}
            onClick={() => onChange(o.value)}
            className="flex-col items-start gap-0 py-1.5"
          >
            <span className="text-[length:var(--fs-xs)] text-foreground">
              {o.value === value ? "✓ " : ""}
              {o.label}
            </span>
            <span className="text-[length:var(--fs-xs)] text-muted-foreground">
              {o.reason ?? o.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Card origin + Type for one copy or (collapsed row) all copies. */
function SourceAndType({
  views,
  busy,
  cardName,
  scope,
  onChange,
}: {
  views: IntentCopyView[];
  busy: boolean;
  cardName: string;
  /** "" for the collapsed row; "Copy n " for a copy line. */
  scope: string;
  onChange: (change: IntentChange) => void;
}) {
  // A short copy still shows what it asks for: From collection.
  const source = common(views.map((v) => v.source ?? "collection"));
  const live = views.filter(
    (v) => v.source === "collection" || v.source === "new",
  );
  const type = common(
    live.map((v) => (v.type === "proxy" ? "proxy" : "original")),
  );
  const anyOwned = views.some((v) => v.anyOwned);
  const noneLabel = originNoneLabel(anyOwned);
  const sourceReason = sourceReasons(views, busy);
  const originOptions = SOURCE_OPTIONS.map((v) => ({
    value: v,
    label: v === "none" ? noneLabel : ORIGIN_OPTION_TEXT[v].label,
    description: ORIGIN_OPTION_TEXT[v].description,
    reason: sourceReason[v],
  }));
  const typeReason = typeReasonsFor(views, busy);
  const typeOptions = SLEEVED_TYPES.map((v) => ({
    value: v,
    label: TYPE_OPTION_TEXT[v].label,
    description: TYPE_OPTION_TEXT[v].description,
    reason: typeReason[v],
  }));
  const typeValue = live.length === 0 ? "mixed" : type;
  return (
    <>
      <span className="flex items-center">
        <QuietSelect<CardSource>
          value={source}
          display={
            source === "mixed"
              ? "Mixed"
              : source === "none"
                ? noneLabel
                : ORIGIN_OPTION_TEXT[source].label
          }
          options={originOptions}
          label={`${scope ? `${scope}card origin` : "Card origin"} for ${cardName}`}
          onChange={(v) => onChange({ source: v })}
        />
      </span>
      <span className="flex items-center">
        <QuietSelect<ImportCopyType>
          value={typeValue}
          display={
            live.length === 0
              ? "—"
              : type === "mixed"
                ? "Mixed"
                : TYPE_OPTION_TEXT[type as "original" | "proxy"].label
          }
          options={typeOptions}
          label={`${scope ? `${scope}type` : "Type"} for ${cardName}`}
          title={live.length === 0 && !busy ? PICK_SOURCE_FIRST_TITLE : undefined}
          onChange={(v) => onChange({ type: v })}
        />
      </span>
    </>
  );
}

/** Generic basic: Card origin is Generic land (sleeved) or Unowned (no copy). */
function GenericOrigin({
  unsleeved,
  label,
  onChange,
}: {
  unsleeved: boolean;
  label: string;
  onChange: (type: ImportCopyType) => void;
}) {
  const value = unsleeved ? "unsleeved" : "original";
  return (
    <QuietSelect<ImportCopyType>
      value={value}
      display={unsleeved ? "Unowned" : GENERIC_ORIGIN_TEXT.label}
      label={label}
      options={[
        {
          value: "original",
          label: GENERIC_ORIGIN_TEXT.label,
          description: GENERIC_ORIGIN_TEXT.description,
        },
        {
          value: "unsleeved",
          label: "Unowned",
          description: "No copy",
        },
      ]}
      onChange={onChange}
    />
  );
}

const NEUTRAL_SELECTED =
  "shadow-[inset_0_0_0_1px_var(--text-secondary)] text-foreground";

const TYPE_STYLE: Record<string, { label: string; selected: string }> = {
  original: {
    label: "Original",
    selected:
      "bg-[rgba(29,158,117,0.18)] shadow-[inset_0_0_0_1px_var(--accent-primary)] text-foreground",
  },
  proxy: {
    label: "Proxy",
    selected:
      "bg-[rgba(74,147,160,0.18)] shadow-[inset_0_0_0_1px_var(--status-proxy)] text-foreground",
  },
  unsleeved: {
    label: "Unsleeved",
    selected: "shadow-[inset_0_0_0_1px_var(--text-secondary)] text-foreground",
  },
};

/** Segmented control: Original / Proxy (/ Unsleeved), or Card source. Shared by copy lines, rows and the bulk bar. */
export function TypeToggle<T extends string = ImportCopyType>({
  value,
  options,
  onChange,
  label,
  labels,
  titles,
  disabledReasons,
}: {
  /** `mixed` presses nothing. */
  value: T | "mixed";
  options: T[];
  onChange: (type: T) => void;
  label: string;
  /** Replace a button's text (generic basics call "original" Sleeved). */
  labels?: Partial<Record<T, string>>;
  /** Hover text for an enabled button. */
  titles?: Partial<Record<T, string>>;
  /** A value that can't be chosen now, with the reason (shown as its title). */
  disabledReasons?: Partial<Record<T, string>>;
}) {
  return (
    <span
      role="group"
      aria-label={label}
      className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full border border-[var(--border-default)] p-0.5"
    >
      {options.map((type) => {
        const pressed = value === type;
        const reason = disabledReasons?.[type];
        return (
          <button
            key={type}
            type="button"
            aria-pressed={pressed}
            disabled={reason !== undefined}
            title={reason ?? titles?.[type]}
            onClick={() => onChange(type)}
            className={cn(
              "inline-flex h-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[length:var(--fs-xs)] text-muted-foreground hover:bg-[var(--bg-surface-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
              pressed && (TYPE_STYLE[type]?.selected ?? NEUTRAL_SELECTED),
            )}
          >
            {type === "original" && (
              <Check
                className="size-3 text-[var(--accent-primary)]"
                aria-hidden="true"
              />
            )}
            {type === "proxy" && (
              <VenetianMask
                className="size-3 text-[var(--status-proxy)]"
                aria-hidden="true"
              />
            )}
            {labels?.[type] ?? TYPE_STYLE[type]?.label ?? type}
          </button>
        );
      })}
    </span>
  );
}

/** Small marker: the default finish isn't available for this printing, so another finish is used. */
function FinishFallbackMark({ finishes }: { finishes: string[] }) {
  const text = `Default finish not available; using ${finishes.join(" / ")}`;
  return (
    <span
      data-finish-fallback="true"
      title={text}
      aria-label={text}
      tabIndex={0}
      className="inline-flex h-[18px] cursor-help items-center gap-0.5 rounded-full border border-[var(--signal-warning)] px-1.5 text-[length:var(--fs-xs)] text-muted-foreground hover:bg-[var(--bg-surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
    >
      <Info
        className="size-3 text-[var(--signal-warning)]"
        aria-hidden="true"
      />
      {finishes.join(" / ")}
    </span>
  );
}

/** Wraps a field; a small dot marks a value that came from the file. */
function FieldWithDot({
  fromFile,
  children,
}: {
  fromFile: boolean;
  children: React.ReactNode;
}) {
  if (!fromFile) return <>{children}</>;
  return (
    <span
      className="relative inline-block shrink-0"
      title="From your file"
      data-from-file="true"
    >
      {children}
      <span
        aria-hidden="true"
        data-testid="file-dot"
        className="pointer-events-none absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-foreground shadow-[0_0_0_2px_var(--bg-surface-hover)]"
      />
    </span>
  );
}

export interface ImportRowEditorProps {
  row: ImportRow;
  resolved: ResolvedImportCopy[];
  kind: "collection" | "deck";
  defaults: ImportDefaults;
  open: boolean;
  selected: boolean;
  /**
   * A GENERIC basic (a basic land whose line named no printing): it still opens and edits (finish),
   * but takes no collection copy, so there is no Original/Proxy/Unsleeved choice, and language and
   * condition can't be saved on a planned slot. A basic naming a printing is not generic.
   */
  generic: boolean;
  /** Generic basics only: art chosen for this basic (image only); null = default art. */
  art?: { scryfallId: string } | null;
  onChangeArt?: (art: { scryfallId: string } | null) => void;
  onToggleOpen: () => void;
  onToggleSelect: (checked: boolean) => void;
  onChangeCopy: (index: number, patch: ImportCopyOwnerEdits) => void;
  /** Generic rows: one line edits every copy of the row at once. */
  onChangeAllCopies?: (indexes: number[], patch: ImportCopyOwnerEdits) => void;
  onApplyAll: () => void;
  /** Deck imports with an intent: Card source and Type. */
  intent?: IntentRowControls;
}

export function ImportRowEditor({
  row,
  resolved,
  kind,
  defaults,
  open,
  selected,
  generic,
  art,
  onChangeArt,
  onToggleOpen,
  onToggleSelect,
  onChangeCopy,
  onChangeAllCopies,
  onApplyAll,
  intent,
}: ImportRowEditorProps) {
  const summary = summariseRowTags(resolved, defaults);
  const heroArtId = generic
    ? (art?.scryfallId ?? getBasicLandDefaultScryfallId(row.cardName))
    : (row.scryfallId ?? null);
  const { triggerProps: nameHover } = useCardHoverPreview({
    scryfallId: heroArtId,
    cardName: row.cardName,
  });
  // Copies whose default finish isn't made for this printing, so their own finish is used.
  const fallbackFinishes = [
    ...new Set(
      resolved
        .filter((c) => c.finishNote === "fallback")
        .map((c) => FINISH_LABELS[c.finish]),
    ),
  ];
  const tagText = [
    ...summary.tags.map(tagDisplayText),
    ...(summary.overflow > 0 ? [`${summary.overflow} more`] : []),
  ];
  const proxyCount = intent
    ? resolved.filter((copy) => copy.type === "proxy").length
    : 0;
  const typeOptions: ImportCopyType[] =
    kind === "deck"
      ? ["original", "proxy", "unsleeved"]
      : ["original", "proxy"];
  // Languages are looked up once, the first time the row is opened.
  const languageLookup = usePrintingLanguages(
    row.setCode,
    row.collectorNumber,
    open && !generic,
  );
  const basicTag = generic;
  const fileLanguages = row.copies
    .map((c) => c.file.language)
    .filter((l): l is string => !!l);

  const pills = !open ? (
    <>
      {summary.tags
        // With Card source and Type columns, Proxy / Unsleeved would repeat them.
        .filter((tag) => !(intent && tag.kind === "type"))
        .map((tag) => (
          <span
            key={`${tag.kind}-${tag.label}`}
            data-tag={tag.kind}
            className={cn(
              "inline-flex h-[18px] items-center gap-0.5 rounded-full border px-1.5 text-[length:var(--fs-xs)] text-muted-foreground",
              tag.label === "Proxy"
                ? "border-[var(--status-proxy)] text-[var(--status-proxy)]"
                : "border-[var(--border-default)]",
            )}
          >
            {tag.label === "Proxy" && <span aria-hidden="true">◆</span>}
            {tag.label === "Foil" && <span aria-hidden="true">★</span>}
            {tag.label === "Etched" && <span aria-hidden="true">✦</span>}
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
      {fallbackFinishes.length > 0 && (
        <FinishFallbackMark finishes={fallbackFinishes} />
      )}
      <span className="sr-only">
        {tagText.length > 0
          ? `Differs from defaults: ${tagText.join(", ")}`
          : "Uses defaults"}
      </span>
    </>
  ) : null;

  const badges = (
    <>
      {row.board === "maybeboard" && (
        <span
          data-tag="maybeboard"
          className="inline-flex h-[18px] items-center rounded-full border border-[var(--border-default)] px-1.5 text-[length:var(--fs-xs)] text-muted-foreground"
        >
          Maybeboard
        </span>
      )}
      {basicTag && (
        <span
          data-tag="basic"
          className="inline-flex h-[18px] items-center rounded-full border border-[var(--border-default)] px-1.5 text-[length:var(--fs-xs)] text-muted-foreground"
        >
          Generic land
        </span>
      )}
      {!generic && !intent?.quiet && intent?.views.some((v) => v.needsSource) && (
        <span
          data-tag="needs-source"
          className="inline-flex h-[18px] items-center rounded-full border border-[var(--signal-warning)] px-1.5 text-[length:var(--fs-xs)] text-[var(--signal-warning)]"
        >
          ◇ Needs a source
        </span>
      )}
      {generic && !intent && resolved.some((c) => c.type === "unsleeved") && (
        <span
          data-tag="unsleeved"
          className="inline-flex h-[18px] items-center rounded-full border border-[var(--signal-warning)] px-1.5 text-[length:var(--fs-xs)] text-[var(--signal-warning)]"
        >
          ◇ Unsleeved
        </span>
      )}
    </>
  );

  return (
    <div
      data-row-key={row.rowKey}
      className={cn(
        "border-b border-[var(--border-subtle)]",
        open &&
          "bg-[var(--bg-surface-hover)] shadow-[inset_2px_0_0_var(--text-secondary)]",
      )}
    >
      <div
        data-row-header
        onClick={(e) => {
          // Clicks on the checkbox or caret button do their own job.
          if (
            (e.target as HTMLElement).closest(
              'button,input,label,[role="checkbox"]',
            )
          )
            return;
          onToggleOpen();
        }}
        className={cn(
          "group grid min-h-[34px] cursor-pointer items-center gap-2 px-2.5 hover:bg-[var(--bg-surface-hover)]",
          intent ? (intent.quiet ? ROW_GRID_PLANNED : ROW_GRID_INTENT) : ROW_GRID,
        )}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onToggleSelect(v === true)}
          aria-label={`Select ${row.cardName}`}
        />
        <span className="text-[length:var(--fs-xs)] tabular-nums text-muted-foreground">
          {row.qty}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 py-1 text-[length:var(--fs-xs)]">
          <span className="truncate text-foreground" {...nameHover}>
            {row.cardName}
          </span>
          {!generic && (
            <span className="text-muted-foreground">
              {row.setCode?.toUpperCase()} {row.collectorNumber}
            </span>
          )}
          {proxyCount > 0 && (
            <span
              data-testid="proxy-chip"
              data-tag="proxy"
              aria-label={`${proxyCount} proxy ${proxyCount === 1 ? "copy" : "copies"}`}
              title={`${proxyCount} proxy ${proxyCount === 1 ? "copy" : "copies"}`}
              className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border border-[var(--status-proxy)] text-[var(--status-proxy)]"
            >
              <VenetianMask className="size-3" aria-hidden="true" />
            </span>
          )}
          {badges}
          {pills}
        </span>
        {intent && (
          <span className="contents">
            {intent.quiet ? (
              <span className="text-[length:var(--fs-xs)] text-muted-foreground">
                {generic
                  ? STATUS_BASIC
                  : intent.views.length === 0
                    ? MAYBEBOARD_NOT_ADDED
                    : intent.views.some((v) => v.anyOwned)
                      ? STATUS_OWNED
                      : STATUS_UNOWNED}
              </span>
            ) : generic ? (
              <span className="flex items-center">
                <GenericOrigin
                  unsleeved={resolved.some((c) => c.type === "unsleeved")}
                  label={`Card origin for ${row.cardName}`}
                  onChange={(type) =>
                    onChangeAllCopies?.(
                      resolved.map((c) => c.index),
                      { type },
                    )
                  }
                />
              </span>
            ) : intent.views.length === 0 ? (
              <span className="text-[length:var(--fs-xs)] text-muted-foreground">
                {MAYBEBOARD_NOT_ADDED}
              </span>
            ) : (
              <SourceAndType
                views={intent.views}
                busy={intent.busy}
                cardName={row.cardName}
                scope=""
                onChange={intent.onChangeRow}
              />
            )}
            {!intent.quiet && (generic || intent.views.length === 0) && (
              <span />
            )}
          </span>
        )}
        {
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Edit"} ${row.cardName}`}
            onClick={onToggleOpen}
            title={open ? "Collapse" : "Edit copies"}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] group-hover:text-foreground"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        }
      </div>

      {open && (
        <div className="flex flex-col pb-2 pl-[62px] pr-2.5">
          {(generic ? resolved.slice(0, 1) : resolved).map((copy, position) => (
            <CopyLine
              key={copy.index}
              row={row}
              copy={
                generic
                  ? {
                      ...copy,
                      type: resolved.some((c) => c.type === "unsleeved")
                        ? "unsleeved"
                        : "original",
                    }
                  : copy
              }
              position={position}
              total={generic ? 1 : resolved.length}
              typeOptions={typeOptions}
              intentView={
                generic
                  ? undefined
                  : intent?.views.find((v) => v.index === copy.index)
              }
              intentBusy={intent?.busy}
              intentQuiet={!!intent?.quiet}
              hasIntent={!!intent}
              onIntentChange={
                intent
                  ? (change) => intent.onChange(copy.index, change)
                  : undefined
              }
              generic={generic}
              art={art}
              onChangeArt={onChangeArt}
              languageLookup={languageLookup}
              fileLanguages={fileLanguages}
              onChange={(patch) =>
                generic && onChangeAllCopies
                  ? onChangeAllCopies(
                      resolved.map((c) => c.index),
                      patch,
                    )
                  : onChangeCopy(copy.index, patch)
              }
              onApplyAll={
                position === 0 && resolved.length > 1 ? onApplyAll : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CopyLine({
  row,
  copy,
  position,
  total,
  typeOptions,
  generic,
  art,
  onChangeArt,
  languageLookup,
  fileLanguages,
  onChange,
  onApplyAll,
  intentView,
  intentBusy,
  intentQuiet,
  hasIntent,
  onIntentChange,
}: {
  intentQuiet?: boolean;
  hasIntent?: boolean;
  generic: boolean;
  intentView?: IntentCopyView;
  intentBusy?: boolean;
  onIntentChange?: (change: IntentChange) => void;
  art?: { scryfallId: string } | null;
  onChangeArt?: (art: { scryfallId: string } | null) => void;
  row: ImportRow;
  copy: ResolvedImportCopy;
  position: number;
  total: number;
  typeOptions: ImportCopyType[];
  languageLookup: LanguageLookup;
  fileLanguages: string[];
  onChange: (patch: ImportCopyOwnerEdits) => void;
  onApplyAll?: () => void;
}) {
  const n = position + 1;
  const [artOpen, setArtOpen] = useState(false);
  // A copy taken from the collection keeps the finish, condition and language it already has (spec §3 #4/#12).
  const usesExistingCopy =
    !generic && !!intentView && !intentQuiet && (intentView.source === "collection" || intentView.source === null);
  const visible = generic
    ? { language: true, finish: true, condition: false }
    : usesExistingCopy
      ? { language: false, finish: false, condition: false }
      : visibleFields(copy.type);
  const finishState = finishControlState(
    row.availableFinishes,
    copy.finish,
    copy.sources.finish,
  );
  const showFinish = visible.finish && finishState.mode === "select";
  const languages = generic
    ? { mode: "ready" as const, codes: Object.keys(LANGUAGE_LABELS) }
    : languageChoices(languageLookup, fileLanguages, copy.language);
  const fromFile = (source: string) => source === "file";
  const suffix = (source: string) =>
    fromFile(source) ? " (from your file)" : "";

  return (
    <div
      role="group"
      aria-label={`Copy ${n} of ${total}`}
      className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] py-1 first:border-t-0"
    >
      {!generic && (
        <span className="w-4 shrink-0 text-[length:var(--fs-xs)] tabular-nums text-[var(--text-tertiary)]">
          {n}
        </span>
      )}
      {generic ? (
        <>
          {hasIntent ? (
            !intentQuiet && (
              <GenericOrigin
                unsleeved={copy.type === "unsleeved"}
                label={`Copy ${n} card origin for ${row.cardName}`}
                onChange={(type) => onChange({ type })}
              />
            )
          ) : (
            <TypeToggle
              value={copy.type === "unsleeved" ? "unsleeved" : "original"}
              options={["original", "unsleeved"]}
              labels={{ original: "Sleeved" }}
              label={`Generic ${row.cardName} sleeving`}
              onChange={(type) => onChange({ type })}
            />
          )}
          <button
            type="button"
            onClick={() => setArtOpen(true)}
            className="rounded-md border border-[var(--border-default)] px-2 py-0.5 text-[length:var(--fs-xs)] text-muted-foreground hover:text-foreground"
          >
            {art ? "Change art…" : "Choose art…"}
          </button>
          <GenericArtPicker
            open={artOpen}
            cardName={row.cardName}
            currentScryfallId={art?.scryfallId ?? null}
            finish={copy.finish}
            onSelect={(p) => {
              setArtOpen(false);
              onChangeArt?.(p ? { scryfallId: p.scryfallId } : null);
            }}
            onClose={() => setArtOpen(false)}
          />
        </>
      ) : (
        <>
          {intentView && onIntentChange && intentQuiet ? null : intentView &&
            onIntentChange ? (
            <SourceAndType
              views={[intentView]}
              busy={!!intentBusy}
              cardName={row.cardName}
              scope={`Copy ${n} `}
              onChange={onIntentChange}
            />
          ) : (
            <TypeToggle
              value={copy.type}
              options={typeOptions}
              label={`Copy ${n} type`}
              onChange={(type) => onChange({ type })}
            />
          )}
          {intentView && onIntentChange && !intentQuiet && intentView.source === "collection" && (
            <PullSelect view={intentView} cardName={row.cardName} n={n} onChange={onIntentChange} />
          )}
        </>
      )}
      {visible.language && languages.mode !== "hidden" && (
        <FieldWithDot fromFile={fromFile(copy.sources.language)}>
          <select
            className={SELECT_CLASS}
            aria-label={`Copy ${n} language${suffix(copy.sources.language)}`}
            value={copy.language}
            disabled={languages.mode === "loading"}
            aria-busy={languages.mode === "loading"}
            onChange={(e) => onChange({ language: e.target.value })}
          >
            {languages.mode === "loading" && (
              <option value={copy.language}>Loading…</option>
            )}
            {languages.mode !== "loading" &&
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
            onChange={(e) =>
              onChange({ finish: e.target.value as ImportFinish })
            }
          >
            {finishState.options.map((option) => (
              <option key={option.value} value={option.value}>
                {FINISH_LABELS[option.value]}
                {option.unlisted ? " — not listed by Scryfall" : ""}
              </option>
            ))}
          </select>
        </FieldWithDot>
      )}
      {visible.finish && copy.finishNote === "unlisted" && (
        <span className="text-[length:var(--fs-xs)] text-[var(--signal-warning)]">
          not listed by Scryfall
        </span>
      )}
      {visible.finish && copy.finishNote === "fallback" && (
        <FinishFallbackMark finishes={[FINISH_LABELS[copy.finish]]} />
      )}
      {visible.condition && (
        <FieldWithDot fromFile={fromFile(copy.sources.condition)}>
          <select
            className={SELECT_CLASS}
            aria-label={`Copy ${n} condition${suffix(copy.sources.condition)}`}
            value={copy.heldCondition}
            onChange={(e) =>
              onChange({ condition: e.target.value as ImportCondition })
            }
          >
            {Object.entries(CONDITION_SHORT_LABELS).map(([value, label]) => (
              <option
                key={value}
                value={value}
                title={CONDITION_LABELS[value as ImportCondition]}
              >
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
  );
}
