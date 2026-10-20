/** Shared labels and classes for the import editing controls. */

export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ko: 'Korean',
  zhs: 'Chinese (Simplified)',
  zht: 'Chinese (Traditional)',
}

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase()
}

/** The language list, plus the current value when it is not one of the common ones. */
export function languageOptions(current?: string): string[] {
  const codes = Object.keys(LANGUAGE_LABELS)
  return current && !codes.includes(current) ? [...codes, current] : codes
}

export const SELECT_CLASS =
  'h-6 rounded-md border border-[var(--border-default)] bg-[var(--bg-canvas)] px-1.5 text-[length:var(--fs-xs)] text-foreground focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]'
