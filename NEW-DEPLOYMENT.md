# Setting up a separate, clean FeedbackIQ for someone else

A fully separate copy: its own database, its own logins, its own web address.
Nothing is shared with the main site except the code (and, optionally, the AI key's balance).

**Never paste a key or password into chat, email or GitHub.** Enter them only in the Supabase and Vercel dashboards.

## 1. New Supabase project
1. supabase.com → New project. Name it e.g. `feedbackiq-test`. Choose region **North EU (Stockholm)** to match the site. Save the database password somewhere safe.
2. Authentication → Sign In / Providers → Email: **turn OFF "Allow new users to sign up"**. (The app relies on this: only people you create can sign in.)
3. SQL Editor → New query → paste the whole of `clean-setup.sql` → Run. It should say "Success". This builds empty tables plus one empty workspace. It has no demo data and does not delete anything.
4. Authentication → Users → **Add user** → "Create new user". Enter the tester's email and a password (10+ characters), and tick auto-confirm. This is their login.

## 2. Keys to collect from the new Supabase project
- Project Settings → API: the **Project URL**, the **publishable (anon) key**, and the **secret (service_role) key**.
- Project Settings → Database → Connection string → **Transaction pooler** (port 6543). Replace the password placeholder with the database password.

## 3. Gemini key
Google AI Studio → API keys → create a new key in the same project (call it "Tester"). It shares your balance but can be deleted on its own without touching the main site's key.

## 4. New Vercel project
1. Vercel → Add New → Project → import the **same GitHub repository**. Do not deploy yet.
2. Settings → Environment Variables (Production and Preview). Add:

| Name | Value |
|---|---|
| `DATABASE_URL` | the transaction pooler connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | the Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret (service_role) key |
| `BOOTSTRAP_OWNER_EMAIL` | the tester's email (the one from step 1.4) |
| `GEMINI_API_KEY` | the tester Gemini key |

Do **not** add `ALLOW_DEV_LOGIN`.
3. Deploy.

## 5. Finish
- Supabase → Authentication → URL Configuration: set **Site URL** to the new Vercel address.
- Open the new address and sign in with the tester's email and password. The first sign-in makes them the owner. Settings → Team lets them add others.

## Things to remember
- Every push to GitHub deploys to **both** sites. Database-structure changes must be applied to each database by hand.
- The free Supabase plan pauses a project after ~7 quiet days. The daily keep-alive in `vercel.json` runs on this deployment too.
- Free Supabase allows 2 active projects in total. Vercel Hobby is for non-commercial use.
- To rename the workspace shown in the app, change the name in Supabase → Table Editor → `workspaces` (and `tenants`).
