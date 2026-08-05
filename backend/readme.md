# ManifestHub backend guide

ManifestHub has a static frontend backed by Supabase, a Cloudflare Worker, and a
scheduled GitHub Actions job. This directory contains the database migrations
and Worker source needed to run those services.

## Architecture

```text
Browser
  |-- Supabase: authentication, profiles, forum, polls, download history
  |-- Cloudflare Worker: download logging, deduplication, Discord notification
  `-- Static JSON: download totals and trending data
                              ^
                              |
                    daily GitHub Actions rollup
```

The service-role key is used only by trusted server-side components. Never put
it in frontend code or commit it to the repository.

## Requirements

- A Supabase project
- A Cloudflare account with Workers and KV
- A GitHub repository with Actions enabled
- Optionally, a Discord webhook for download notifications
- Any static host for the frontend

## 1. Configure Supabase

Open the Supabase SQL Editor and run the appropriate scripts.

For a new installation:

1. Run `download-history.sql` to create download history and event storage.
2. Run `forum.sql` to create forum profiles, posts, replies, votes, triggers,
   functions, and row-level security policies.
3. Run `community-poll.sql` if the community poll is needed.

For an existing installation, use the non-destructive migrations as needed:

1. `download-events-rollup.sql` adds temporary events used by the daily rollup.
2. `download-history-compact.sql` compacts repeated history entries.
3. `forum.sql` can be rerun to refresh the main forum schema and policies.
4. `forum-admin-moderation.sql` adds admin labels and moderation permissions.

Review each SQL file before running it against production. After setup:

- Enable the Email provider under **Authentication > Providers**.
- Configure the site URL and allowed redirect URLs for the production domain.
- Copy the project URL and anon key into `src/core/config.js`.
- Keep the service-role key for the Worker and GitHub Actions only.

The frontend anon key is intentionally public; security depends on the database
row-level security policies, not on hiding that key.

## 2. Deploy the Cloudflare Worker

Use `cloudflare-worker.js` as the Worker entry point. Create a KV namespace and
bind it to the Worker as `DEDUP_KV`, then configure these Worker variables:

| Name | Type | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Variable | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Server-side database access |
| `DOWNLOAD_WEBHOOK_URL` | Secret | Discord download notifications |
| `DEDUP_KV` | KV binding | Short-lived duplicate download protection |

Deploy the Worker and update the Worker URL used by the frontend if the domain
differs from the current production configuration.

The Worker supports:

- `GET ?download={appId}&name={name}&uid={userId}` to log and redirect a download.
- `GET ?top=true` to return the optional live popular-download response.
- `OPTIONS` for browser CORS preflight requests.

## 3. Configure the daily rollup

The workflow at `.github/workflows/update-trending.yml` runs
`scripts/update-trending.js` daily. Add these repository Actions secrets:

| Secret | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Reads and removes processed download events |

The job updates and commits:

- `data/download-counts.json`
- `data/download-rollup-state.json`
- `data/trending-data.json`

Run **Roll Up Daily Downloads** manually from the Actions tab after initial
setup to verify its permissions and secrets. The workflow needs repository
`contents: write` access so it can commit the generated JSON.

## 4. Configure forum administrators

Forum moderation uses email addresses in `public.admins`. Add an administrator
with SQL similar to:

```sql
insert into public.admins (email)
values ('admin@example.com');
```

Run `forum-admin-moderation.sql` after `forum.sql`. Administrators can then be
identified in discussions and can delete forum posts or replies. Confirm the
exact `admins` table columns in your project before inserting records.

## File reference

| File | Purpose |
| --- | --- |
| `cloudflare-worker.js` | Download bridge and server-side event logger |
| `download-history.sql` | Complete download-history schema for new projects |
| `download-events-rollup.sql` | Non-destructive event-rollup migration |
| `download-history-compact.sql` | Compact per-user history migration |
| `forum.sql` | Main forum schema, triggers, functions, and RLS |
| `forum-admin-moderation.sql` | Forum administrator permissions |
| `community-poll.sql` | Poll and poll-vote schema |
| `manifesthub-record.gs` | Legacy Google Apps Script integration |
| `backend.md` | Older detailed architecture reference |

## Verification checklist

- A new user can register, confirm their email, sign in, and sign out.
- A signed-in user can see only their own download history.
- Forum posts, replies, and votes work; anonymous visitors can only read.
- A download redirects successfully and creates the expected Supabase event.
- Repeated downloads within the KV window are deduplicated.
- The manual rollup updates the three JSON data files.
- No service-role key or webhook URL is present in browser-delivered files.

## Troubleshooting

- **Supabase returns 401/403:** verify the URL/key pair and the relevant RLS
  policies. Use the anon key in the browser and the service-role key only on the
  Worker or in Actions.
- **Downloads work but are not logged:** inspect Worker logs, bindings, and
  Supabase REST responses. Confirm `DEDUP_KV` is bound and the event table exists.
- **Rollup does not commit:** check Actions secrets and repository workflow write
  permissions, then run the workflow manually.
- **Auth redirects to the wrong host:** update the Supabase site URL and redirect
  allow list for the deployed domain.
