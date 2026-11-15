// Paths that must work without an Oracle browser sign-in. Exact match only, never a prefix. Contract section 3.
export const CONNECTOR_PUBLIC_PATHS = ['/mcp', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'] as const

export function isConnectorPublicPath(pathname: string): boolean {
  return (CONNECTOR_PUBLIC_PATHS as readonly string[]).includes(pathname)
}
