// The address a person pastes into Claude. Uses the site's own address when it is set at build time, else the live site.
export const FALLBACK_SITE_URL = 'https://oracle-alpha-two.vercel.app'

export function connectorAddress(siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  const base = (siteUrl && /^https?:\/\//.test(siteUrl) && !/localhost|127\.0\.0\.1/.test(siteUrl) ? siteUrl : FALLBACK_SITE_URL).replace(/\/+$/, '')
  return `${base}/mcp`
}
