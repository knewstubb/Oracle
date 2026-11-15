import { siteUrl } from './errors'

/** Static protected-resource document (RFC 9728). No secrets. */
export function protectedResourceDocument() {
  return {
    resource: `${siteUrl()}/mcp`,
    authorization_servers: [`${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'Oracle',
  }
}
