# ManifestHub - Backend Workflow & Requirements

This document describes the backend architecture, data flow, and setup requirements for ManifestHub.

---

## 1. Overview

The frontend is a static site (`index.html` + `profile/index.html`). All "backend" work happens through third-party services:

- **Supabase** — primary database, authentication, and realtime presence
- **Cloudflare Worker** — download bridge, deduplication, Discord alerts, and Supabase event logging
- **GitHub Actions** — daily rollup from Supabase events into static JSON counters

---

## 2. Architecture

```text
Frontend (static HTML/JS)
    │
    ├── Supabase JS Client ──────► Supabase (auth, download_history)
    │
    ├── Cloudflare Worker ◄──────► Cloudflare KV (dedup)
    │         │
    │         ├──► Discord Webhook (alerts)
    │         │
    │         └──► Supabase REST (download_events + download_history insert)
    │
    ├── GitHub Action ─────────► Supabase (reads/deletes download_events)
    │         └──► data/download-counts.json + data/trending-data.json
    │
    └── GitHub / Steam APIs (directly from browser)
```

---

## 3. Components

### 3.1 Supabase

**Role:** Primary database and auth provider.

**Tables / Functions:**
- `public.download_history` — latest 50 downloads per logged-in user
- `public.download_events` — temporary global raw download events for daily rollups
- `public.forum_profiles` — public forum display names synced from Supabase Auth
- `public.forum_posts` / `public.forum_replies` — forum discussions and replies
- `public.forum_post_votes` / `public.forum_reply_votes` — authenticated user votes
- `public.admins` — existing email-based admin list used for forum moderation
- `public.is_forum_admin()` / `public.get_forum_admin_ids()` — secure forum admin checks
- `public.get_popular_downloads()` — optional live RPC over temporary events

**Auth:**
- Email/password with email confirmation
- Row Level Security (RLS) ensures users only read their own history
- A trigger keeps only the latest **50** downloads per user


**Setup:**
1. Create a Supabase project
2. For an existing project, run `backend/download-events-rollup.sql` in the SQL Editor
   to add the temporary rollup table without dropping user history
3. Run `backend/download-history-compact.sql` to make profile history upserts compact
4. For a brand-new project, `backend/download-history.sql` can build the full schema
5. Run `backend/forum.sql` to enable the forum. This migration is non-destructive
   and can be run again safely when policies or functions change
6. Enable **Email** provider in Auth settings
7. Note the **Project URL** and **anon/public** key (used in frontend)
8. Note the **Service Role** key (used in Cloudflare Worker and GitHub Actions)

---

### 3.2 Cloudflare Worker


**File:** `cloudflare-worker.js`

**Role:** The main backend bridge. It is the only server-side component that write-logs downloads.

**Endpoints:**

| Method | Path / Query | Description |
|--------|--------------|-------------|
| `GET` | `?top=true` | Optional live top endpoint over temporary Supabase events |
| `GET` | `?download={appId}&name={name}&uid={userId}` | Logs a download, deduplicates, alerts Discord, then redirects to GitHub |

**Environment Variables (secrets):**

| Name | Purpose |
|------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS for inserts) |
| `DOWNLOAD_WEBHOOK_URL` | Discord webhook URL for download alerts |
| `DEDUP_KV` | Cloudflare KV namespace binding (for 30s dedup) |


**Behavior on `?download=…`:**
1. Parse `appId`, `gameName`, `userId` from query params
2. Classify download type: `.manifest`, `.lua`, `ZIP`, or `Legacy`
3. **Deduplicate** using KV: if the same IP + appId + type was logged in the last 30s, skip
4. Fire-and-forget a background task that:
   - Sends a Discord embed/notification
   - Inserts a row into `public.download_events` for the daily rollup
   - Upserts a row into `public.download_history` if `userId` is present
5. If the request is a CORS preflight/ping, return `200 Logged`
6. Otherwise, `302` redirect to:
   `https://codeload.github.com/SteamAutoCracks/ManifestHub/zip/refs/heads/{appId}`

**Deploy:**
1. `wrangler init` or use Cloudflare dashboard
2. Bind a **KV namespace** to `DEDUP_KV`
3. Set the secrets under **Settings → Variables**
4. Deploy and note the Worker URL (e.g. `https://manifesthub-bridge.trionine.workers.dev/`)

---

### 3.3 GitHub Action Rollup

**Files:**
- `.github/workflows/update-trending.yml`
- `scripts/update-trending.js`
- `data/download-counts.json`
- `data/download-rollup-state.json`
- `data/trending-data.json`

**Role:** Keep Supabase small by converting temporary raw events into permanent static JSON counts once per day.

**Flow:**
1. Read unprocessed rows from `public.download_events`
2. Add them to `data/download-counts.json`
3. Generate the public top 50 list at `data/trending-data.json`
4. Commit and push the JSON files
5. Delete processed rows from `public.download_events`

**GitHub secrets:**

| Name | Purpose |
|------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key used by the Action to read/delete events |

---

## 4. Data Flow

### 4.1 Download Flow

```text
User clicks Download
       │
       ▼
Frontend builds Worker URL:
  ?download={appId}&name={gameName - .manifest}&uid={userId}
       │
       ▼
Cloudflare Worker
  ├─ Dedup check (KV, 30s TTL)
  ├─ Discord alert (best-effort)
  ├─ Supabase download_events insert (all users)
  ├─ Supabase download_history upsert (logged-in users)
  └─ 302 Redirect → GitHub codeload ZIP
```

**Key points:**
- The redirect is always to GitHub; the Worker never proxies the file itself
- Deduplication prevents the same user/IP from spamming logs within 30 seconds
- Logging is fire-and-forget (`ctx.waitUntil`), so a slow Supabase write does not block the redirect

### 4.2 Trending / Popular Downloads Flow

```text
Frontend (index.html)
  └─ GET /data/trending-data.json
        │
        ▼
  Small committed JSON file:
    [{appId, gameName, count}, ...]
        │
        ▼
  Frontend renders "Popular Downloads"
```

The browser must not fetch `data/download-counts.json`; that file is only used by GitHub Actions.

### 4.3 User Download History Flow

```text
Frontend (`profile/index.html`)
  └─ Supabase client query:
      SELECT * FROM download_history
      WHERE user_id = auth.uid()
      ORDER BY created_at DESC
```
- Results are cached in `localStorage` for instant subsequent loads
- A background re-fetch checks for updates and refreshes the cache

---

## 5. Requirements Checklist

| Component | Required Account / Service | Cost |
|-----------|---------------------------|------|
| **Frontend hosting** | Netlify / Vercel / GitHub Pages | Free tier works |
| **Supabase** | Free tier project | Free (up to 50k MAU, 500MB DB) |
| **Cloudflare Worker** | Free Cloudflare account | Free tier (100k requests/day) |
| **KV Namespace** | Cloudflare account | Free tier included |
| **Discord Webhook** | Any Discord server | Free |
| **GitHub** | Repo: `SteamAutoCracks/ManifestHub` | Free (public repo traffic) |

---

## 6. Secrets & Configuration Reference

### Frontend (`index.html`, `profile/index.html`)
- Supabase **anon/public** key — safe to expose in client-side code
- Supabase **Project URL** — safe to expose

### Cloudflare Worker (server-side only)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DOWNLOAD_WEBHOOK_URL`
- `DEDUP_KV` (binding)

### GitHub Actions
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## 7. Maintenance Notes

- **Trending staleness:** The browser reads the latest committed `data/trending-data.json`. If the Action fails, the last committed top list remains available.
- **Supabase RLS:** The `download_history` table uses RLS. The Worker uses the **service role** key to bypass RLS for inserts; the frontend uses the **anon** key and is restricted to its own rows.
- **History pruning:** The DB trigger automatically keeps only the latest 50 rows per user. With `download-history-compact.sql`, repeated user/app/type downloads refresh an existing row instead of creating duplicates.
- **Global event pruning:** `download_events` rows are deleted by the GitHub Action after their counts have been committed.
- **Discord rate limits:** Discord webhooks have rate limits; very high traffic may drop alerts. This is non-critical.

---

## 8. File Map

```text
ManifestHub/
├── backend/
│   ├── cloudflare-worker.js      # Cloudflare Worker entry point
│   ├── download-events-rollup.sql # Non-destructive event rollup migration
│   ├── forum.sql                   # Forum tables, vote triggers, and RLS
│   ├── download-history-compact.sql # Non-destructive compact profile history migration
│   ├── manifesthub-record.gs     # Legacy Google Apps Script logger/API
│   ├── download-history.sql       # Supabase schema + RLS + event rollup table
│   └── backend.md                 # This file
├── src/
│   ├── components/                # Shared frontend behavior
│   └── pages/
│       ├── database/              # Main database page controllers
│       └── profile/index.js       # Profile page controller
├── index.html                     # Main page
└── profile/index.html             # Profile page
```
