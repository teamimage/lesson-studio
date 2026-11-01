# Lesson Studio

Lesson organization for private music teachers: lesson summaries, practice
suggestions, per-student history and parent sheets.

Stack: Next.js (App Router) on Vercel, Supabase for auth, database and storage.

## What's here so far

- Email sign-in with a one-time code or a link (`/login`, `/auth/confirm`)
- **Teacher side** (`/`): studio dashboard with every student, practice days
  this week, and lesson records waiting for approval
  - `/students/new`, `/students/[id]`, `/students/[id]/edit`: student
    profiles, repertoire list, lesson history, linked parents
  - `/students/[id]/lessons/new`, `/lessons/[id]`, `/lessons/[id]/edit`: the
    lesson record (pieces worked on, "today we", focus point, practice
    assignments, note to the parent, teacher-only suggestions and notes).
    Records start as drafts; **approving** publishes them to the family and
    updates the repertoire list.
  - `/students/[id]/brief`: the two-minute pre-lesson brief
  - `/lessons/[id]/sheet`: printable one-page lesson sheet (letter size)
- **Family side** (`/family`, `/family/[studentId]`): this week's plan from
  the latest approved lesson, a daily checklist, minutes, listening, and a
  note for the teacher. Parents see only their own children and only
  approved records.
- `/settings`: teacher name and studio name, sign out
- `src/proxy.ts` refreshes the Supabase session on every request and sends
  signed-out visitors to `/login`
- Supabase clients for the browser (`src/lib/supabase/client.ts`) and the
  server (`src/lib/supabase/server.ts`); generated types in
  `src/lib/supabase/types.ts`

## Database

The schema lives in `supabase/migrations/` and is applied to the Supabase
project. Every table has row-level security:

- A teacher (a row in `teachers` tied to their auth user) manages their own
  `students`, `parents`, `lessons`, `lesson_pieces`, `assignments`,
  `repertoire` and `practice_logs`.
- A parent is matched by `parents.user_id` or, before they first sign in, by
  their email. They can read their children, approved lessons and
  assignments, and read and write practice logs.
- Whoever signs in with no teacher row and no parent invitation becomes a
  teacher.

`supabase/seed/family.sql` holds the sample family data (two Suzuki
students, lessons, assignments, a week of practice). Names are placeholders
to rename in the app.

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

AI video processing (the lesson page's "Process video" button) needs two
server-only secrets. Never prefix these with `NEXT_PUBLIC_`:

| Name | Where to get it |
| --- | --- |
| `ANTHROPIC_API_KEY` | platform.claude.com > API keys (add credit under Billing) |
| `ASSEMBLYAI_API_KEY` | assemblyai.com > Dashboard > API keys |
| `LESSON_AI_MODEL` (optional) | Claude model for drafting; default `claude-opus-5-5` |

Every AI call is logged with its cost in the `ai_usage` table; totals are in
Settings > AI costs. Prices live in `src/lib/ai/pricing.ts`.

## Fast video streaming (optional)

Lesson videos are stored as uploaded (often 2 to 4 GB) in the private
`lesson-recordings` bucket. That original stays the master copy: the AI
transcript and the "Original" link use it. When Cloudflare Stream is set up,
each finished upload is also sent to Cloudflare (by a 24-hour signed link),
which makes a compressed, adaptive HLS copy that starts playing in a second
or two. Players use that copy when it's ready and the original until then,
or if the stream fails to load.

- Server-only env vars: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_TOKEN`
  (an API token with the Stream: Edit permission). Without them nothing
  changes.
- Columns `stream_uid`, `stream_status`, `stream_hls_url`, `stream_error` on
  `recordings` (migration `20261101200000_streaming_copies.sql`).
- Streaming copies require signed URLs. `GET /api/recordings/[id]/stream`
  hands a 6-hour playback token to whoever can read the recording row;
  `POST` starts or checks the copy (teachers only). The lesson page shows
  "Preparing a fast streaming copy" while Cloudflare works, and starts copies
  for videos uploaded before streaming was turned on.
- Deleting a recording deletes its Cloudflare copy too.

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
