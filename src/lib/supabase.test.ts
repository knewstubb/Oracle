import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('supabase client module', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('createAdminClient', () => {
    it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

      const { createAdminClient } = await import('./supabase')
      expect(() => createAdminClient()).toThrow('Missing NEXT_PUBLIC_SUPABASE_URL')
    })

    it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const { createAdminClient } = await import('./supabase')
      expect(() => createAdminClient()).toThrow('Missing SUPABASE_SERVICE_ROLE_KEY')
    })

    it('returns a supabase client when env vars are set', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

      const { createAdminClient } = await import('./supabase')
      const client = createAdminClient()
      expect(client).toBeDefined()
      expect(client.from).toBeInstanceOf(Function)
    })
  })

  describe('createServerClient (deprecated alias)', () => {
    it('is an alias for createAdminClient', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

      const { createServerClient, createAdminClient } = await import('./supabase')
      expect(createServerClient).toBe(createAdminClient)
    })
  })

  describe('createAuthServerClient', () => {
    it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

      const { createAuthServerClient } = await import('./supabase-server')
      await expect(createAuthServerClient()).rejects.toThrow('Missing NEXT_PUBLIC_SUPABASE_URL')
    })

    it('throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      const { createAuthServerClient } = await import('./supabase-server')
      await expect(createAuthServerClient()).rejects.toThrow('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')
    })
  })

  describe('createBrowserClient', () => {
    it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

      const { createBrowserClient } = await import('./supabase')
      expect(() => createBrowserClient()).toThrow('Missing NEXT_PUBLIC_SUPABASE_URL')
    })

    it('throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      const { createBrowserClient } = await import('./supabase')
      expect(() => createBrowserClient()).toThrow('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')
    })

    it('returns a supabase client when env vars are set', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

      const { createBrowserClient } = await import('./supabase')
      const client = createBrowserClient()
      expect(client).toBeDefined()
      expect(client.from).toBeInstanceOf(Function)
    })
  })
})
