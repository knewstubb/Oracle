'use server'

import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createAuthServerClient } from '@/lib/supabase-server'
import { deleteConnection, insertConnection } from '@/lib/connector/connection-store'
import { isValidAuthorizationId, processConsent, type ConsentDeps } from '@/lib/connector/consent'

async function deps(): Promise<ConsentDeps> {
  const supabase = await createAuthServerClient()
  return {
    getUserId: async () => (await getAuthUser())?.id ?? null,
    getDetails: async (id) => {
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id)
      if (error || !data) return { kind: 'error' }
      if ('authorization_id' in data) return { kind: 'details', clientId: data.client.id, clientName: data.client.name }
      return { kind: 'already', redirectUrl: data.redirect_url }
    },
    approve: async (id) => {
      const { data, error } = await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      return error || !data ? { error: true } : { redirectUrl: data.redirect_url }
    },
    deny: async (id) => {
      const { data, error } = await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
      return error || !data ? { error: true } : { redirectUrl: data.redirect_url }
    },
    insertConnection,
    deleteConnection,
  }
}

async function decide(decision: 'allow' | 'deny', formData: FormData) {
  const id = formData.get('authorization_id')
  const result = await processConsent(decision, id, await deps())
  if ('redirectTo' in result) redirect(result.redirectTo)
  if (result.error === 'unauthenticated') redirect('/login')
  const back = isValidAuthorizationId(id) ? `/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=1` : '/oauth/consent?error=1'
  redirect(back)
}

export async function allowConnection(formData: FormData) {
  await decide('allow', formData)
}

export async function denyConnection(formData: FormData) {
  await decide('deny', formData)
}
