import { SECTION_LABEL_CLASS } from '@/lib/ui-tokens'
import type { OutsideView } from '@/lib/deck-rail-stats'

const chip = 'inline-flex max-w-full items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[length:var(--fs-xs)] font-medium'

/** Things that are in the deck record but not one of the 100: the companion, the Maybeboard and tokens. Shows nothing when there are none. */
export function RailOutside({ outside }: { outside: OutsideView }) {
  const { companion, maybeboard, tokens } = outside
  if (!companion && maybeboard === 0 && tokens === 0) return null
  return (
    <div className="space-y-1.5" data-testid="rail-outside">
      <p className={SECTION_LABEL_CLASS}>Outside the 100</p>
      <ul className="flex flex-wrap gap-1.5">
        {companion && (
          <li className={chip}>
            <span className="text-[var(--text-muted)]">Companion</span>
            <span className="min-w-0 truncate">{companion.name}</span>
            <span className="text-[var(--text-muted)]">· {companion.sleeved ? 'sleeved' : 'not sleeved'}</span>
          </li>
        )}
        {maybeboard > 0 && (
          <li className={chip}>
            <span className="text-[var(--text-muted)]">Maybeboard</span>
            {maybeboard}
          </li>
        )}
        {tokens > 0 && (
          <li className={chip}>
            <span className="text-[var(--text-muted)]">Tokens</span>
            {tokens}
          </li>
        )}
      </ul>
    </div>
  )
}
