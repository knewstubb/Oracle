// Error shapes for the Claude connector, slice A. Contract: docs/oracle/contracts/claude-connector-slice-a.md section 10.
import type { ConnectorErrorBody, ConnectorErrorCode } from '../../../docs/oracle/contracts/claude-connector-slice-a.types'

export type { ConnectorErrorBody, ConnectorErrorCode }

export const MESSAGES = {
  UNAUTHENTICATED: 'Your Oracle sign-in expired or is missing. Please reconnect Oracle in Claude.',
  CONNECTION_REVOKED: 'This connection was switched off in Oracle. Reconnect it from Claude to allow it again.',
  FORBIDDEN_ORIGIN: 'This request came from somewhere Oracle does not accept.',
  LOOKUP_FAILED: 'Oracle could not read your collection just now. This is not an empty collection. Try again.',
  NOT_FOUND: 'No deck with that id in your Oracle.',
  TOO_LARGE: 'That result is too large to return. Ask for a smaller page.',
} as const

export function errorBody(code: ConnectorErrorCode, message: string, retryable = false): ConnectorErrorBody {
  return { ok: false, error: { code, message, retryable } }
}

export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')
  return raw.replace(/\/+$/, '')
}

export function protectedResourceMetadataUrl(): string {
  return `${siteUrl()}/.well-known/oauth-protected-resource`
}

function escapeHeader(v: string): string {
  return v.replace(/["\\\r\n]/g, ' ')
}

/** 401 with the WWW-Authenticate header that tells the client where to start sign-in. */
export function unauthorized(code: 'UNAUTHENTICATED' | 'CONNECTION_REVOKED', description?: string): Response {
  const message = MESSAGES[code]
  const desc = description ?? message
  return Response.json(errorBody(code, message), {
    status: 401,
    headers: {
      'WWW-Authenticate': `Bearer error="invalid_token", error_description="${escapeHeader(desc)}", resource_metadata="${protectedResourceMetadataUrl()}"`,
    },
  })
}

export function noTokenResponse(): Response {
  return Response.json(errorBody('UNAUTHENTICATED', MESSAGES.UNAUTHENTICATED), {
    status: 401,
    headers: { 'WWW-Authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl()}"` },
  })
}

export function forbiddenOrigin(): Response {
  return Response.json(errorBody('FORBIDDEN_ORIGIN', MESSAGES.FORBIDDEN_ORIGIN), { status: 403 })
}

export function lookupFailedResponse(): Response {
  return Response.json(errorBody('LOOKUP_FAILED', MESSAGES.LOOKUP_FAILED, true), { status: 503 })
}
