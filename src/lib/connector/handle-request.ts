// Per-request sequence for /mcp. Contract section 4. Dependencies are injectable so the order can be unit-tested.
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { checkConnection, touchConnection } from './connection-store'
import { errorBody, forbiddenOrigin, lookupFailedResponse, noTokenResponse, unauthorized } from './errors'
import { MAX_REQUEST_BYTES } from './limits'
import { createConnectorServer } from './server'
import { createUserScopedClient, type ReadOnlyDb } from './user-client'
import { verifyConnectorToken } from './verify-token'

export const ALLOWED_ORIGINS = ['https://claude.ai', 'https://claude.com']

export interface McpDeps {
  verify: typeof verifyConnectorToken
  check: typeof checkConnection
  touch: typeof touchConnection
  makeDb: (token: string) => ReadOnlyDb
}

const defaultDeps: McpDeps = { verify: verifyConnectorToken, check: checkConnection, touch: touchConnection, makeDb: createUserScopedClient }

function methodNotAllowed(): Response {
  return new Response(JSON.stringify(errorBody('INVALID_INPUT', 'Use POST.')), { status: 405, headers: { Allow: 'POST', 'Content-Type': 'application/json' } })
}

export async function handleMcpRequest(req: Request, deps: McpDeps = defaultDeps): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed()

  // 1. Origin
  const origin = req.headers.get('origin')
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return forbiddenOrigin()

  // 2. Bearer token present
  const auth = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(\S+)$/i.exec(auth)
  if (!m) return noTokenResponse()
  const token = m[1]

  // 3. Verify locally
  const v = await deps.verify(token)
  if (!v.ok) {
    return unauthorized('UNAUTHENTICATED', v.reason === 'expired' ? 'Your Oracle sign-in expired. Please reconnect Oracle in Claude.' : 'Invalid token')
  }

  // 4. Off-switch, every request, fail closed
  const c = await deps.check(v.userId, v.clientId)
  if (c.status === 'error') return lookupFailedResponse()
  if (c.status === 'revoked') return unauthorized('CONNECTION_REVOKED')

  // 5. last_used_at, best effort
  void deps.touch(c.connectionId, v.userId)

  // Body (32 KB cap)
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > MAX_REQUEST_BYTES) return Response.json(errorBody('INVALID_INPUT', 'Request too large.'), { status: 413 })
  const text = await req.text()
  if (new TextEncoder().encode(text).length > MAX_REQUEST_BYTES) return Response.json(errorBody('INVALID_INPUT', 'Request too large.'), { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return Response.json(errorBody('INVALID_INPUT', 'Request body is not valid JSON.'), { status: 400 })
  }

  // 6. User-scoped client: the only client tool code ever receives
  const db = deps.makeDb(token)
  const server = createConnectorServer({ db, userId: v.userId })
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    // 7. Dispatch
    return await transport.handleRequest(req, { parsedBody: body })
  } finally {
    void server.close().catch(() => {})
  }
}
