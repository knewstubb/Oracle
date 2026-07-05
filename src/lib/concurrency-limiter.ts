/**
 * Sequential task runner with configurable delay between executions.
 * Prevents EDHREC API rate limiting by spacing MCP calls.
 */
export class ConcurrencyLimiter {
  private delayMs: number
  private lastExecutionEnd: number = 0

  constructor(delayMs: number = 500) {
    this.delayMs = delayMs
  }

  /** Execute an async task, waiting delayMs after the previous task completed */
  async execute<T>(task: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const elapsed = now - this.lastExecutionEnd
    const waitTime = Math.max(0, this.delayMs - elapsed)

    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    const result = await task()
    this.lastExecutionEnd = Date.now()
    return result
  }

  /** Process an array of items sequentially with the limiter */
  async processAll<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = []
    for (const item of items) {
      const result = await this.execute(() => processor(item))
      results.push(result)
    }
    return results
  }
}
