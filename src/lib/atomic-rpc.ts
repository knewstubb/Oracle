export type AtomicRpcResult = Record<string, unknown>

function isRecord(value: unknown): value is AtomicRpcResult {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assertAtomicRpcSuccess(
  data: unknown,
  operation: string
): AtomicRpcResult {
  if (!isRecord(data) || data.success !== true) {
    throw new Error(`${operation} returned an invalid success result`)
  }
  return data
}

export function assertAtomicRpcCount(
  result: AtomicRpcResult,
  field: string,
  operation: string,
  expected?: number
): number {
  const value = result[field]
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${operation} returned an invalid ${field}`)
  }
  if (expected !== undefined && value !== expected) {
    throw new Error(`${operation} returned ${field}=${String(value)}, expected ${expected}`)
  }
  return value as number
}

export function assertAtomicRpcId(
  result: AtomicRpcResult,
  field: string,
  operation: string
): number {
  const value = result[field]
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${operation} returned an invalid ${field}`)
  }
  return value as number
}

export function assertAtomicRpcIdList(
  result: AtomicRpcResult,
  field: string,
  operation: string,
  expectedLength?: number
): number[] {
  const value = result[field]
  if (
    !Array.isArray(value) ||
    !value.every(item => Number.isInteger(item) && item > 0) ||
    (expectedLength !== undefined && value.length !== expectedLength)
  ) {
    throw new Error(`${operation} returned an invalid ${field}`)
  }
  return value as number[]
}

export function assertAtomicRpcBoolean(
  result: AtomicRpcResult,
  field: string,
  operation: string
): boolean {
  const value = result[field]
  if (typeof value !== 'boolean') {
    throw new Error(`${operation} returned an invalid ${field}`)
  }
  return value
}

export function assertAtomicRpcOptionalId(
  result: AtomicRpcResult,
  field: string,
  operation: string
): number | null {
  const value = result[field]
  if (value !== null && (!Number.isInteger(value) || (value as number) <= 0)) {
    throw new Error(`${operation} returned an invalid ${field}`)
  }
  return value as number | null
}
