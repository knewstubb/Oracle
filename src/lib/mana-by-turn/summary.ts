export interface TurnSummary {
  avg: number[]
  p10: number[]
  p90: number[]
}

function nearestRank(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[rank - 1]
}

/** Mean and nearest-rank 10th and 90th percentile for each turn. */
export function summarise(samples: number[][]): TurnSummary {
  const avg: number[] = []
  const p10: number[] = []
  const p90: number[] = []
  for (const turn of samples) {
    const sorted = [...turn].sort((a, b) => a - b)
    avg.push(turn.length === 0 ? 0 : turn.reduce((s, v) => s + v, 0) / turn.length)
    p10.push(nearestRank(sorted, 10))
    p90.push(nearestRank(sorted, 90))
  }
  return { avg, p10, p90 }
}
