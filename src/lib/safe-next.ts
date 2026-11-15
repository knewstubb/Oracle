// Where to send the browser after sign-in. Only a same-site path is accepted; anything else falls back to "/".
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > 2000) return '/'
  if (!raw.startsWith('/')) return '/'
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return '/'
  return raw
}
