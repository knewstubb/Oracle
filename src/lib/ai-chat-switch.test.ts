import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { isAiChatEnabled, aiChatPausedResponse } from './ai-chat-switch'

// Anything that could reach the paid AI service is replaced by a counter.
const outbound = vi.hoisted(() => ({ calls: 0 }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() {
      outbound.calls++
      throw new Error('outbound AI client created')
    }
  },
}))
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    constructor() {
      outbound.calls++
      throw new Error('outbound AI client created')
    }
  },
}))
vi.mock('@/lib/provider-factory', () => ({
  createProviderAdapter: () => {
    outbound.calls++
    throw new Error('outbound AI adapter created')
  },
  ProviderConfigError: class extends Error {},
}))
vi.mock('@/lib/auth', () => ({
  requireAuth: async () => new Response('unauthorised', { status: 401 }),
}))

const ROUTES: Array<{ path: string; id?: boolean }> = [
  { path: '@/app/api/oracle/chat/route' },
  { path: '@/app/api/oracle/sessions/[id]/generate-name/route', id: true },
  { path: '@/app/api/decks/[id]/chat/route', id: true },
  { path: '@/app/api/brew/chat/route' },
  { path: '@/app/api/brew/extract/route' },
  { path: '@/app/api/brew/assess/route' },
  { path: '@/app/api/brew/skeleton/route' },
  { path: '@/app/api/ai/brew/start/route' },
  { path: '@/app/api/ai/brew/generate/route' },
  { path: '@/app/api/ai/brew/investigate/route' },
  { path: '@/app/api/ai/brew/refine/route' },
]

async function callPost(path: string, withId?: boolean): Promise<Response | null> {
  const mod = (await import(/* @vite-ignore */ path)) as {
    POST: (req: NextRequest, ctx?: unknown) => Promise<Response>
  }
  const req = new NextRequest('http://localhost/api/test', { method: 'POST', body: '{}' })
  try {
    return await mod.POST(req, withId ? { params: Promise.resolve({ id: '1' }) } : undefined)
  } catch {
    return null // the route ran past the switch and failed later; it was not refused
  }
}

describe('AI chat switch', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is paused unless the setting is exactly "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_AI_CHAT_ENABLED', '')
    expect(isAiChatEnabled()).toBe(false)
    vi.stubEnv('NEXT_PUBLIC_AI_CHAT_ENABLED', 'yes')
    expect(isAiChatEnabled()).toBe(false)
    vi.stubEnv('NEXT_PUBLIC_AI_CHAT_ENABLED', 'true')
    expect(isAiChatEnabled()).toBe(true)
    expect(aiChatPausedResponse()).toBeNull()
  })

  it('is paused when the setting is not set at all', () => {
    delete process.env.NEXT_PUBLIC_AI_CHAT_ENABLED
    expect(isAiChatEnabled()).toBe(false)
  })
})

describe('chat and brew routes', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    outbound.calls = 0
    fetchSpy = vi.fn(async () => {
      throw new Error('network blocked in test')
    })
    vi.stubGlobal('fetch', fetchSpy)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  for (const { path, id } of ROUTES) {
    it(`${path}: paused answers 503 "paused" and makes no outbound call`, async () => {
      vi.stubEnv('NEXT_PUBLIC_AI_CHAT_ENABLED', 'false')
      const res = await callPost(path, id)
      expect(res?.status).toBe(503)
      expect((await res!.json()).error).toBe('paused')
      expect(outbound.calls).toBe(0)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it(`${path}: switched on is not refused as paused`, async () => {
      vi.stubEnv('NEXT_PUBLIC_AI_CHAT_ENABLED', 'true')
      const res = await callPost(path, id)
      if (res) {
        const text = await res.clone().text()
        expect(text).not.toContain('"paused"')
      }
    })
  }
})
