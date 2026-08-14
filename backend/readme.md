# ManifestHub Backend Architecture & Setup Guide

ManifestHub pairs a static frontend with serverless backend components using **Supabase**, a **Cloudflare Worker**, and **GitHub Actions**. This directory contains all database schemas, migration scripts, worker code, and operational documentation needed to run and maintain the backend infrastructure.

---

## 1. System Architecture

```text
Frontend (Static HTML/JS)
    │
    ├── Supabase Client ───────────► Supabase (Auth, Profiles, Forum, Polls, Download History)
    │
    ├── Cloudflare Worker ─────────► Cloudflare KV (30s Deduplication)
    │         │
    │         ├──► Discord Webhook (Download Alert Notifications)
    │         │
    │         └──► Supabase REST (Raw Event Logging & History Upserts)
    │
    ├── GitHub Actions Rollup ─────► Supabase (Reads/Deletes Raw Download Events)
    │         └──► data/download-counts.json + data/trending-data.json
    │
    └── GitHub / Steam APIs (Directly from browser for manifest fetching)
```

---

## 2. Backend Components

### 2.1 Supabase (Database & Authentication)

**Role:** Primary database, authentication provider, and real-time forum/poll storage.

**Database Schema & Functions:**
- `public.download_history`: Per-user download records (automatically pruned to the latest 50 entries per user via DB trigger).
- `public.download_events`: Temporary raw download event logs used for daily trend rollups.
- `public.forum_profiles`: User display names and profiles synced from Supabase Auth.
- `public.forum_posts` & `public.forum_replies`: Community forum topics, discussions, and replies.
- `public.forum_post_votes` & `public.forum_reply_votes`: Upvotes/downvotes for forum content.
- `public.admins`: Table storing administrator email addresses for moderation permissions.
- `public.is_forum_admin()` & `public.get_forum_admin_ids()`: Security definer functions for admin role checks.
- `public.get_popular_downloads()`: RPC function providing live top download counts.

**Authentication & Security:**
- Email/password authentication with email verification.
- Strict **Row Level Security (RLS)** policies ensuring users can only read/manage their own profile and download history.
- Browser-delivered code uses only the public **anon key**. Server-side Worker and GitHub Actions use the **service-role key** to bypass RLS for write operations.

### 2.2 Cloudflare Worker (`cloudflare-worker.js`)

**Role:** Serverless API bridge handling download redirects, logging, KV deduplication, and Discord notifications.

**Endpoints:**

| Method | Query Parameters | Description |
|---|---|---|
| `GET` | `?download={appId}&name={name}&uid={userId}` | Logs download event, deduplicates request, sends Discord alert, and returns a 302 redirect to GitHub repository zip. |
| `GET` | `?top=true` | Returns live popular downloads directly from Supabase events. |
| `OPTIONS` | N/A | CORS preflight handler for cross-origin browser requests. |

**Key Execution Logic (`?download=...`):**
1. Extracts `appId`, `gameName`, and `userId` from query parameters.
2. Identifies download file type (`.manifest`, `.lua`, `ZIP`, or `Legacy`).
3. Checks Cloudflare KV namespace (`DEDUP_KV`) using key `ip:appId:type`. If a log exists within 30 seconds, deduplicates and skips duplicate logging.
4. Executes non-blocking background tasks (`ctx.waitUntil`):
   - Sends Discord notification embed to webhook (if configured).
   - Inserts raw event into `public.download_events`.
   - Upserts history entry into `public.download_history` if user is signed in.
5. Responds with `302 Redirect` to `https://codeload.github.com/SteamAutoCracks/ManifestHub/zip/refs/heads/{appId}`.

### 2.3 GitHub Actions Daily Rollup

**Workflow & Scripts:**
- `.github/workflows/update-trending.yml`
- `scripts/update-trending.js`

**Role:** Maintains a compact static dataset by aggregating temporary raw Supabase events into permanent JSON files once per day.

**Rollup Process:**
1. Fetches unprocessed records from `public.download_events`.
2. Merges new counts into permanent counter file `data/download-counts.json`.
3. Generates the top 50 trending items into `data/trending-data.json`.
4. Updates rollup timestamp in `data/download-rollup-state.json`.
5. Commits updated JSON files back to the git repository.
6. Cleans up processed records from `public.download_events`.

---

## 3. Data Flows

### 3.1 Download Flow

```text
User clicks Download on Frontend
       │
       ▼
Browser requests Worker URL:
  ?download={appId}&name={gameName}&uid={userId}
       │
       ▼
Cloudflare Worker
  ├─ KV Deduplication Check (30s window)
  ├─ Discord Webhook Alert (best-effort background task)
  ├─ Supabase download_events Insert (background task)
  ├─ Supabase download_history Upsert (if userId present)
  └─ 302 Redirect → GitHub codeload ZIP
```

### 3.2 Trending & Popular Downloads Flow

```text
Browser (index.html)
  └─ GET /data/trending-data.json (Committed static JSON)
        │
        ▼
  Frontend renders "Popular Downloads" list
```

### 3.3 User Download History Flow

```text
Browser (profile/index.html)
  └─ Supabase Client Query:
      SELECT * FROM download_history
      WHERE user_id = auth.uid()
      ORDER BY created_at DESC
```

---

## 4. Requirements & Service Costs

| Component | Required Service | Cost Tier |
|---|---|---|
| **Frontend Hosting** | Cloudflare Pages / Netlify / Vercel / GitHub Pages | Free |
| **Database & Auth** | Supabase Project | Free (Up to 50k MAU, 500MB DB) |
| **Serverless Worker** | Cloudflare Workers | Free (100k requests/day) |
| **Deduplication Store** | Cloudflare KV Namespace | Free |
| **Alerts & Logging** | Discord Webhook | Free |
| **Data Aggregation** | GitHub Actions | Free (Public Repository) |

---

## 5. Step-by-Step Setup Guide

### Step 1: Configure Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in Supabase and execute the schema files in order:
   - **For new installations:**
     1. Run `download-history.sql` (Creates download history, raw events table, and pruning triggers).
     2. Run `forum.sql` (Creates forum profiles, posts, replies, votes, RLS policies, and triggers).
     3. Run `community-poll.sql` (Creates community poll and vote tables).
   - **For existing installations / updates:**
     1. Run `download-events-rollup.sql` (Adds non-destructive event rollup structures).
     2. Run `download-history-compact.sql` (Adds non-destructive compact history upserts).
     3. Run `forum-admin-moderation.sql` (Adds administrator tables and moderation helper functions).
3. In **Authentication > Providers**, enable **Email**.
4. Configure Site URL and allowed Redirect URLs for your environment under **Authentication > URL Configuration**.
5. Copy your **Project URL** and **anon / public key** into `src/core/config.js`.
6. Save your **service-role key** securely for deployment in Cloudflare Worker and GitHub Secrets.

### Step 2: Deploy Cloudflare Worker

1. Create a Worker in the Cloudflare Dashboard (or via `wrangler`).
2. Set `cloudflare-worker.js` as the Worker entry point.
3. Create a Cloudflare KV namespace named `manifest-dedup` and bind it to the Worker as `DEDUP_KV`.
4. Configure the following environment variables & secrets under **Settings > Variables**:

| Name | Type | Purpose |
|---|---|---|
| `SUPABASE_URL` | Plaintext Variable | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Server-side database access |
| `DOWNLOAD_WEBHOOK_URL` | Secret | Discord webhook URL for download alerts |
| `DEDUP_KV` | KV Binding | KV namespace for 30s duplicate protection |

5. Deploy the Worker and note the deployed endpoint URL.

### Step 3: Configure GitHub Actions Daily Rollup

1. Navigate to your repository's **Settings > Secrets and variables > Actions**.
2. Add the following repository secrets:

| Secret Name | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key used by script to read and prune `download_events` |

3. Ensure Workflow Permissions under **Settings > Actions > General** are set to **Read and write permissions** (required for committing generated JSON files).
4. Run the **Roll Up Daily Downloads** workflow manually from the Actions tab to verify setup.

### Step 4: Configure Forum Administrators

Insert administrator email addresses into `public.admins` using the Supabase SQL Editor:

```sql
INSERT INTO public.admins (email)
VALUES ('admin@example.com');
```

Users logged in with a matching email will receive administrative moderation badges and permissions to delete forum posts or replies.

---

## 6. Secrets & Configuration Summary

| Layer | File / Location | Exposed Keys | Private Secrets |
|---|---|---|---|
| **Frontend** | `src/core/config.js` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | None |
| **Cloudflare Worker** | Cloudflare Dashboard | `SUPABASE_URL`, `DEDUP_KV` | `SUPABASE_SERVICE_ROLE_KEY`, `DOWNLOAD_WEBHOOK_URL` |
| **GitHub Actions** | Repository Secrets | None | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

---

## 7. Directory File Map

| File | Description |
|---|---|
| `README.md` | Unified backend architecture and setup documentation (this file). |
| `cloudflare-worker.js` | Cloudflare Worker source code for download handling and event logging. |
| `download-history.sql` | Complete initial Supabase schema, RLS policies, and pruning triggers. |
| `download-events-rollup.sql` | Migration adding raw event table and rollup RPC for existing DBs. |
| `download-history-compact.sql` | Migration for non-destructive compact user history updates. |
| `forum.sql` | Migration for forum profiles, topics, replies, votes, and RLS policies. |
| `forum-admin-moderation.sql` | Migration for admin moderation roles and checks. |
| `community-poll.sql` | Migration for community polls and voting. |
| `manifesthub-record.gs` | Legacy Google Apps Script integration reference. |

---

## 8. Verification & Operational Checklist

- [ ] New user can register, verify email, sign in, and sign out.
- [ ] Signed-in user views only their own download history on `/profile/`.
- [ ] Anonymous users can read forum discussions and poll results, but must sign in to post/vote.
- [ ] File download click correctly increments counters and redirects to GitHub zip archive.
- [ ] Rapid consecutive downloads for the same file/IP within 30 seconds are deduplicated.
- [ ] GitHub Action daily rollup completes successfully and commits `data/trending-data.json`.
- [ ] No `service-role` key or Discord webhook URL is leaked in client-side code.

---

## 9. Troubleshooting

- **Supabase 401 / 403 Errors:** Verify `SUPABASE_URL` and keys. Check RLS policies on the target table. Confirm client code uses `anon` key while Worker/Actions use `service-role` key.
- **Downloads redirect but are not logged:** Inspect Cloudflare Worker logs. Ensure `DEDUP_KV` is properly bound and `public.download_events` table exists in Supabase.
- **GitHub Action fails to commit:** Ensure Actions repository secrets are set and Workflow permissions have Write access enabled under Repository Settings.
- **Auth Redirect Issues:** Verify Site URL and Additional Redirect URLs in Supabase Auth settings match your deployed domain.
