export type AlertAction = 'fixed' | 'dismissed'

export function isAlertAction(value: unknown): value is AlertAction {
  return value === 'fixed' || value === 'dismissed'
}
