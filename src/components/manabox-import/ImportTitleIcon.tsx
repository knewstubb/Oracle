import { Layers, Library } from 'lucide-react'

/** Small icon beside the modal title so collection and deck imports look different at a glance. */
export function ImportTitleIcon({ kind }: { kind: 'collection' | 'deck' }) {
  const Icon = kind === 'collection' ? Library : Layers
  return (
    <span
      data-import-icon={kind}
      className="mr-2 inline-grid size-6 shrink-0 place-items-center rounded-md bg-[var(--bg-hover)] align-middle text-[var(--accent-primary)]"
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </span>
  )
}
