import type { Primer } from '@/lib/rating-engine'

interface PrimerSectionProps {
  primer: Primer
}

export function PrimerSection({ primer }: PrimerSectionProps) {
  return (
    <section className="space-y-6">
      <h2 className="text-[length:var(--fs-lg)] font-medium">Primer</h2>

      <div className="space-y-5">
        <div>
          <h3 className="text-[length:var(--fs-md)] font-medium text-muted-foreground mb-2">
            Core Strategy
          </h3>
          <p className="text-[length:var(--fs-md)] leading-relaxed">{primer.coreStrategy}</p>
        </div>

        <div>
          <h3 className="text-[length:var(--fs-md)] font-medium text-muted-foreground mb-2">
            Mulligan Priorities
          </h3>
          <ul className="list-disc list-inside space-y-1">
            {primer.mulliganPriorities.map((item, i) => (
              <li key={i} className="text-[length:var(--fs-md)]">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-[length:var(--fs-md)] font-medium text-muted-foreground mb-2">
            Key Tips
          </h3>
          <ul className="list-disc list-inside space-y-1">
            {primer.keyTips.map((item, i) => (
              <li key={i} className="text-[length:var(--fs-md)]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
