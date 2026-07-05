# Authentication Setup

The Oracle uses invite-only authentication via Supabase Auth. There is no public sign-up — all user accounts are provisioned by the admin (Brad) through the Supabase Dashboard.

## Disable Self-Registration

Self-registration must be disabled so that only invited playgroup members can access the app.

1. Open the [Supabase Dashboard](https://supabase.com/dashboard)
2. Select The Oracle project
3. Navigate to **Authentication** → **Settings** → **Auth Providers**
4. Under **Email**, uncheck **"Allow new users to sign up"**
5. Click **Save**

With this disabled, the `/login` page only works for users who already have an account. There is no sign-up form or public registration endpoint.

## Inviting New Playgroup Members

User provisioning is admin-only. To add a new member:

1. Open the [Supabase Dashboard](https://supabase.com/dashboard)
2. Select The Oracle project
3. Navigate to **Authentication** → **Users**
4. Click **Invite user**
5. Enter the member's email address
6. Click **Send invite**

### What happens next

- The invited user receives an email with a magic link
- Clicking the link takes them to the app's `/auth/callback` route
- They set their password during this flow
- Their account is now active and they can log in with email/password

## Capacity

The system supports up to **8 concurrent user accounts** (one per playgroup member). This is a private playgroup tool, not a public service.

## Notes

- User provisioning is intentionally manual — this keeps the system locked to known friends
- If a member needs their password reset, use **Authentication → Users → ⋮ menu → Send password recovery**
- Removing a member: **Authentication → Users → ⋮ menu → Delete user**
