import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

/**
 * Returns the element with the given id once the page has mounted (null on the server and
 * during hydration). Used to render into the app footer / chat panel slots in MainContentWrapper.
 */
export function useDomHost(id: string): HTMLElement | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => document.getElementById(id),
    () => null
  )
}
