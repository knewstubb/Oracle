/**
 * Create a test user for Playwright E2E tests.
 * 
 * Usage:
 *   npx tsx scripts/create-test-user.ts
 * 
 * This script:
 *   1. Creates a user in Supabase Auth with email/password
 *   2. Auto-confirms the email (no verification needed)
 *   3. Updates .env.test.local with the credentials
 * 
 * The test user is isolated and won't have your personal collection data.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

// Test user credentials
const TEST_EMAIL = 'playwright@test.oracle.local'
const TEST_PASSWORD = 'PlaywrightTest2024!'

async function main() {
  console.log('🔧 Creating test user for Playwright E2E tests...\n')

  // Create admin client with service role
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === TEST_EMAIL)

  if (existingUser) {
    console.log('ℹ️  Test user already exists:', TEST_EMAIL)
    console.log('   User ID:', existingUser.id)
    
    // Update password in case it changed
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      { password: TEST_PASSWORD }
    )
    
    if (updateError) {
      console.error('❌ Failed to update password:', updateError.message)
    } else {
      console.log('✅ Password updated')
    }
  } else {
    // Create new user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        display_name: 'Playwright Test User',
        is_test_account: true,
      },
    })

    if (createError) {
      console.error('❌ Failed to create user:', createError.message)
      process.exit(1)
    }

    console.log('✅ Test user created:', TEST_EMAIL)
    console.log('   User ID:', newUser.user?.id)
  }

  // Update .env.test.local
  const envPath = path.join(__dirname, '../.env.test.local')
  const envContent = `# Playwright E2E test credentials
# Created by scripts/create-test-user.ts
TEST_USER_EMAIL=${TEST_EMAIL}
TEST_USER_PASSWORD=${TEST_PASSWORD}
`

  fs.writeFileSync(envPath, envContent)
  console.log('\n✅ Updated .env.test.local with test credentials')

  // Clean up any existing auth session file
  const authFile = path.join(__dirname, '../tests/e2e/.auth/session.json')
  if (fs.existsSync(authFile)) {
    fs.unlinkSync(authFile)
    console.log('🗑️  Removed old session.json (re-run test:e2e:setup to create new one)')
  }

  console.log('\n📋 Next steps:')
  console.log('   1. Start dev server: npm run dev')
  console.log('   2. Save auth session: npm run test:e2e:setup')
  console.log('   3. Run tests: npm run test:e2e')
}

main().catch(console.error)
