# Pipply

A job application tracker built with Next.js and Supabase. Track applications, log field changes over time, sync with Gmail via AI parsing, and keep everything in one place.

## Tech Stack

- **Next.js 16** (App Router) — React 19, TypeScript
- **Supabase** — Auth (GitHub + Google OAuth), Postgres database
- **Groq API** — AI-powered email parsing (Stage 1 relevance check, Stage 2 body parsing)
- **Tailwind CSS 4** + **shadcn/ui** — styling and UI primitives
- **Framer Motion** — page transitions and micro-animations
- **OGL** — WebGL gradient background (`Grainient` component)
- **react-resizable-panels** — resizable three-panel dashboard layout

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables**

   Copy `.env.example` (or create `.env`) with:

   ```
   NEXT_PUBLIC_SUPABASE_URL=<your supabase project url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
   SUPABASE_SERVICE_ROLE_KEY=<your service role key>
   GROQ_API_KEY=<your groq api key>
   GOOGLE_CLIENT_ID=<your google oauth client id>
   GOOGLE_CLIENT_SECRET=<your google oauth client secret>
   ```

3. **Set up the database**

   Run these SQL files in the Supabase SQL Editor (in order):

   - `supabase-user-tokens.sql` — stores OAuth access/refresh tokens
   - `supabase-rls-application-current.sql` — RLS policies for `application_current`
   - `supabase-application-field-events.sql` — creates the `application_field_events` table and enums

   The database schema consists of several key tables:
   - **`applications`** — the parent table; links a `user_id` to a `job_url`.
   - **`application_current`** — the "ground truth" table; holds the most up-to-date fields (company, title, salary, etc.) for every application.
   - **`application_field_events`** — the audit log; every field change (whether manual or AI-extracted) is logged here to power the timeline.
   - **`emails`** — the storage layer; caches email headers and body content fetched from Gmail.
   - **`application_email_links`** — the join table; manages the many-to-many relationship between applications and emails, including `confidence` scores and `is_active` toggles.
   - **`user_tokens`** — the auth layer; stores encrypted OAuth access and refresh tokens for Gmail API access.

4. **Configure OAuth providers**

   In your Supabase dashboard, enable GitHub and Google as auth providers. Set the redirect URL to `http://localhost:3000/auth/callback`.

5. **Run the dev server**

   ```bash
   npm run dev
   ```

## Project Structure

```
app/
├── (auth)/login/                   # OAuth login (GitHub / Google)
├── auth/callback/route.ts          # OAuth callback handler
├── dashboard/
│   ├── page.tsx                    # Main dashboard with resizable panels
│   ├── dashboard.module.css
│   └── components/
│       ├── ApplicationsList.tsx    # List panel (search, filter, bulk select/delete)
│       ├── ApplicationDetails.tsx  # Central detail panel with inline edits
│       ├── EmailsTimeline.tsx      # Chronological timeline of events/emails
│       ├── EmailViewerModal.tsx    # Full email viewer overlay (Gmail-style)
│       ├── NewApplicationModal.tsx # Manual or URL-based application creation
│       └── ScanEmailsModal.tsx     # AI email scanner UI
├── api/
│   ├── applications/               # CRUD for applications and field events
│   │   ├── route.ts                # GET (list) / POST (create manual)
│   │   ├── [id]/route.ts           # GET / PUT (field update) / DELETE
│   │   ├── [id]/events/route.ts    # GET field event history
│   │   └── auto-import/route.ts    # POST: scrape a job URL and auto-populate
│   ├── emails/
│   │   ├── route.ts                # GET / PATCH (toggle link) / DELETE
│   │   └── [id]/route.ts           # GET full email body
│   ├── scan-emails/
│   │   ├── route.ts                # Stage 1: batch relevance check
│   │   └── process/route.ts        # Stage 2: deep parsing + DB update
│   ├── timeline/route.ts           # GET aggregated timeline events
│   └── dev/token/route.ts          # Dev utility to grab session tokens
lib/
├── applications.ts                 # Core business logic (state recalculation, event building)
├── application-field-limits.ts     # Text length limits for editable fields
├── date-only.ts                    # Local timezone date formatting
├── gmail.ts                        # Gmail API integration & token management
├── llm-parser.ts                   # Groq API / LLM parsing logic (two-stage)
├── salary-validation.ts            # Salary input parsing and validation
├── supabase/                       # Supabase client, admin, and auth utilities
└── utils.ts                        # General utilities (cn helper)
types/
├── applications.ts                 # Shared types, enums, and display label maps
└── validator.ts                    # Input validation helpers
scripts/
├── test-llm-confidence.ts          # Verify LLM extraction accuracy
└── clean-emails.mjs                # Reset email data for testing
```

## AI Email Scanner

Pipply features a two-stage AI email parsing system:

1. **Stage 1 (Relevance)**: email headers are fetched from Gmail and sent to a fast LLM batch check to determine if any match tracked applications.
2. **Stage 2 (Body Parsing)**: for relevant emails, the full body is fetched and a more capable LLM extracts field updates (status changes, interview invites, salary info, etc.).
3. **Chronological Accuracy**: a bulk recalculation phase runs after scanning. It replays all events for an application across its entire history and resets its current state based on the most recent chronological events, ensuring data consistency even when emails arrive out of order.

The system supports model fallback — if one Groq model is rate-limited or unavailable, it automatically rotates to the next in its configured model list.

## Auto-Import from URL

When creating a new application, users can paste a job posting URL. The server:
1. Validates and fetches the page HTML
2. Checks link reachability via `broken-link-checker`
3. Extracts fields using HTML heuristics (og:title, h1, meta tags, regex patterns)
4. Creates the application with initial timeline events for each extracted field

## API Routes

### Applications
- `GET /api/applications` — list all applications for the current user
- `POST /api/applications` — create a manual application
- `POST /api/applications/auto-import` — create an application by scraping a job URL
- `GET /api/applications/:id` — get derived state for one application
- `PUT /api/applications/:id` — update a single field (auto-logs to timeline)
- `DELETE /api/applications/:id` — delete an application and all related data
- `GET /api/applications/:id/events` — get field event history for timeline

### Email Scanning
- `POST /api/scan-emails` — search Gmail for relevant updates in a date range
- `POST /api/scan-emails/process` — process selected emails, extracting structured updates

### Emails
- `GET /api/emails?application_id=:id` — get emails linked to an application
- `GET /api/emails/:id` — get full email body content
- `PATCH /api/emails` — toggle `is_active` for an email link (recalculates application state)
- `DELETE /api/emails` — permanently delete email links and associated timeline events

### Timeline
- `GET /api/timeline` — get aggregated timeline events

### Dev Utilities
- `GET /api/dev/token` — get current session token for external testing

## Dashboard Architecture

The dashboard uses a three-panel resizable layout:
- **Left**: application list with search, status/location filters, and bulk select/delete
- **Center**: application details with inline field editing, related emails with link/unlink toggles, and email selection for deletion
- **Right**: chronological timeline of all field changes, email events, and scrape events

State management uses a cache-first strategy with optimistic updates for email toggling and field edits. A force-refresh pattern ensures the UI stays in sync with the server after mutations like scanning or deleting emails.

## Timezone Support

All date inputs (New Application, Scan Dates, etc.) use a custom local timezone formatter to ensure that "today" matches your browser's system clock, avoiding common UTC "future date" bugs in late-night PDT hours.

## Bulk Actions

The dashboard supports bulk selection for both emails (in the Details panel) and applications (in the List panel), allowing for rapid cleanup and project management.

