import '@testing-library/jest-dom/vitest'

// Placeholder Supabase settings so modules that read them at import time can
// load under test. Tests that touch Supabase mock it; nothing here is a real key.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'
