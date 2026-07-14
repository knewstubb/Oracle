import type { Weakness, WeaknessSeverity } from '@/lib/rating-engine'

interface WeaknessSectionProps {
  weaknesses: Weakness[]
}

const severityOrder: WeaknessSeverity[] = ['Critical', 'Moderate', 'Minor']

const severityConfig: Record<
  WeaknessSeverity,
  { icon: string; label: string; className: string }
> = {
  Critical: {
    icon: '⚠️',
    label: 'Critical',
    className:
      'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
  },
  Moderate: {
    icon: '⚡',
    label: 'Moderate',
    className:
      'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200',
  },
  Minor: {
    icon: 'ℹ️',
    label: 'Minor',
    className:
      'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
  },
}

const severityBadgeColors: Record<WeaknessSeverity, string> = {
  Critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Moderate:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Minor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
}

export function WeaknessSection({ weaknesses }: WeaknessSectionProps) {
  if (weaknesses.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-[length:var(--fs-md)] font-medium">Weaknesses</h3>
        <p className="text-[length:var(--fs-md)] text-muted-foreground">
          No weaknesses identified
        </p>
      </div>
    )
  }

  // Group weaknesses by severity
  const grouped = severityOrder.reduce(
    (acc, severity) => {
      const items = weaknesses.filter((w) => w.severity === severity)
      if (items.length > 0) {
        acc.push({ severity, items })
      }
      return acc
    },
    [] as { severity: WeaknessSeverity; items: Weakness[] }[]
  )

  return (
    <div className="space-y-3">
      <h3 className="text-[length:var(--fs-md)] font-medium">Weaknesses</h3>
      <div className="space-y-3">
        {grouped.map(({ severity, items }) => {
          const config = severityConfig[severity]
          return (
            <div key={severity} className="space-y-2">
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true">{config.icon}</span>
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium ${severityBadgeColors[severity]}`}
                >
                  {config.label}
                </span>
              </div>
              <ul className="space-y-2">
                {items.map((weakness) => (
                  <li
                    key={weakness.description}
                    className={`rounded-md border p-3 ${config.className}`}
                  >
                    <p className="text-[length:var(--fs-md)]">{weakness.description}</p>
                    {weakness.hateCards.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {weakness.hateCards.map((card) => (
                          <span
                            key={card}
                            className="inline-flex items-center rounded bg-black/5 px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium dark:bg-white/10"
                          >
                            {card}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
