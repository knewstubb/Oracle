"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import type { ImportIntent } from "../../../docs/oracle/contracts/import-intent.types";
import {
  INTENT_OPTIONS,
  INTENT_QUESTION,
  INTENT_CHOOSE_ERROR,
  INTENT_NUMBERS_PENDING,
} from "./import-copy";

export interface ImportIntentChoiceProps {
  value: ImportIntent | null;
  onChange: (intent: ImportIntent) => void;
  /** Show "Choose one to continue." under the cards. */
  showError?: boolean;
  /** Options that can't be picked right now (the selected one never looks disabled). */
  disabledValues?: ImportIntent[];
  /** Greyed out until the deck has loaded; the layout does not move. */
  disabled?: boolean;
  /** After the deck loads: what each option would do, in numbers. */
  stats?: Partial<Record<ImportIntent, string>>;
  /** Shown beside the question, e.g. "You own 86 of the 100 cards." */
  headline?: string;
  /** The suggested option and why (shown beside its label). */
  suggestion?: { value: ImportIntent; reason: string };
}

/**
 * "What's this deck?": three radio cards. After the deck loads it shows numbers per option and pre-selects the suggestion. Native radios, so the arrow keys
 * move and select within the group (spec §10).
 */
export function ImportIntentChoice({
  value,
  onChange,
  showError,
  disabledValues,
  stats,
  disabled: allDisabled,
  headline,
  suggestion: _suggestion,
}: ImportIntentChoiceProps) {
  const labelId = useId();
  const errorId = useId();
  const name = useId();
  return (
    <div className={cn("flex flex-col gap-2", allDisabled && "opacity-50")}>
      <p id={labelId} className="text-[length:var(--fs-md)] font-medium">
        {INTENT_QUESTION}
        {headline && (
          <span className="ml-2 text-[length:var(--fs-sm)] font-normal text-muted-foreground">
            {headline}
          </span>
        )}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={showError ? errorId : undefined}
        aria-disabled={allDisabled || undefined}
        className="grid grid-cols-3 gap-2"
      >
        {INTENT_OPTIONS.map((opt) => {
          const checked = value === opt.value;
          const disabled =
            !!allDisabled ||
            (!checked && !!disabledValues?.includes(opt.value));
          return (
            <label
              key={opt.value}
              data-intent={opt.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors",
                "hover:border-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]",
                "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent-primary)]",
                checked
                  ? "border-[var(--accent-primary)] bg-[var(--accent-primary-bg)]"
                  : "border-[var(--border-default)]",
                disabled &&
                  "cursor-not-allowed opacity-50 hover:border-[var(--border-default)] hover:bg-transparent",
              )}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(opt.value)}
                className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-[var(--accent-primary)]"
              />
              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "text-[length:var(--fs-md)]",
                    checked ? "font-bold" : "font-medium",
                  )}
                >
                  {opt.label}
                </span>
                <span className="text-[length:var(--fs-xs)] text-muted-foreground">
                  {opt.description}
                </span>
                {allDisabled && !stats && (
                  <span className="mt-1 text-[length:var(--fs-xs)] text-muted-foreground">
                    {INTENT_NUMBERS_PENDING}
                  </span>
                )}
                {stats?.[opt.value] && (
                  <span
                    data-intent-stats
                    className="mt-1 text-[length:var(--fs-xs)] text-foreground"
                  >
                    {stats[opt.value]}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {showError && !value && (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-[length:var(--fs-xs)] text-foreground"
        >
          <span aria-hidden="true" className="text-[var(--signal-critical)]">
            ⚠
          </span>
          {INTENT_CHOOSE_ERROR}
        </p>
      )}
    </div>
  );
}
