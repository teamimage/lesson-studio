# Lesson Studio

Lesson organization for private music teachers: lesson summaries, practice
suggestions, per-student history and parent sheets.

Stack: Next.js (App Router) on Vercel, Supabase for auth, database and storage.

## What's here so far

- Email sign-in with a one-time code or a link (`/login`, `/auth/confirm`)
- `src/proxy.ts` refreshes the Supabase session on every request and sends
  signed-out visitors to `/login`
- Supabase clients for the browser (`src/lib/supabase/client.ts`) and the
  server (`src/lib/supabase/server.ts`)

## Environment variables

Two values, both safe to expose to the browser (data is protected by Row Level
Security in Supabase, not by hiding these):

| Name | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > Data API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase > Project Settings > API Keys |

Set them in Vercel under Project > Settings > Environment Variables. For local
development, copy `.env.example` to `.env.local`.

Never put the Supabase **secret** (service role) key in a `NEXT_PUBLIC_`
variable or commit it.

## Supabase auth settings

In Supabase > Authentication > URL Configuration, set **Site URL** to
`https://lesson-studio-theta.vercel.app` and add these **Redirect URLs**:

- `https://lesson-studio-theta.vercel.app/**`
- `https://lesson-studio-*-shop-os8.vercel.app/**` (preview deploys)
- `http://localhost:3000/**`

In Supabase > Authentication > Emails, replace the body of both the
**Magic Link** and **Confirm signup** templates with:

```html
<h2>Sign in to Lesson Studio</h2>
<p>Your sign-in code is:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>Or <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">click here to sign in</a>.</p>
```

The code works on any device. The link uses `token_hash`, so it works even if
the email opens in a different browser than the one that asked for it.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```
