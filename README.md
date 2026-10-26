# Lesson Studio

Lesson organization for private music teachers: lesson summaries, practice
suggestions, per-student history and parent sheets.

Stack: Next.js (App Router) on Vercel, Supabase for auth, database and storage.

## What's here so far

- Email magic-link sign-in (`/login`, `/auth/confirm`)
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

In Supabase > Authentication > URL Configuration, set **Site URL** to the
Vercel production URL and add `http://localhost:3000/**` and
`https://*-teamimage.vercel.app/**` to **Redirect URLs** so sign-in links
work locally and on preview deploys.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```
