# neuralyn-supabase-backup

Automated Supabase Postgres backup to Cloudflare R2, every 6 hours.

A Cloudflare Worker runs on a cron schedule, invokes a container that streams
`pg_dump -Fc` straight into an R2 multipart upload, and emails on failure.

## Setup

1. Install: `npm install`
2. Edit `wrangler.jsonc` `vars` block: set `R2_ACCOUNT_ID`, `R2_BUCKET`, `MAIL_FROM`, `MAIL_TO`, `MAIL_PROVIDER`.
3. Set secrets:
   ```bash
   wrangler secret put BACKUP_DATABASE_URL
   wrangler secret put R2_ACCESS_KEY_ID
   wrangler secret put R2_SECRET_ACCESS_KEY
   wrangler secret put MAIL_API_KEY
   ```
4. Build container & deploy: `npm run deploy`

## Configuration

### Plain vars (`wrangler.jsonc` `vars` block)

| Variable | Description |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID; also the host of the R2 S3 endpoint (`https://<id>.r2.cloudflarestorage.com`). |
| `R2_BUCKET` | Target R2 bucket name (e.g. `neuralyn-backups`). |
| `R2_PREFIX` | Key prefix for dumps. Objects land at `<prefix>YYYY/MM/DD/backup-<ISO>.dump`. |
| `MAIL_PROVIDER` | Failure-email provider: `resend` or `smtp2go`. |
| `MAIL_FROM` | From address for failure emails. |
| `MAIL_TO` | Recipient for failure emails. |
| `BACKUP_TIMEOUT_MS` | Max dump+upload time in ms before the container aborts (default `1500000` = 25 min). |

### Secrets (`wrangler secret put` in production, `.dev.vars` locally)

| Secret | Description |
|---|---|
| `BACKUP_DATABASE_URL` | Postgres connection string. **Use the Supabase Supavisor session-mode pooler, not the direct connection** — see below. |
| `R2_ACCESS_KEY_ID` | R2 API token Access Key ID. The token must have **Object Read & Write** permission on the target bucket (Object Read only causes `Access Denied`). |
| `R2_SECRET_ACCESS_KEY` | R2 API token Secret Access Key (shown once, when the token is created). |
| `MAIL_API_KEY` | API key for the configured `MAIL_PROVIDER` (Resend or SMTP2GO). |

#### `BACKUP_DATABASE_URL` — use the Supavisor pooler

The Supabase **direct** connection (`db.<ref>.supabase.co:5432`) resolves to an
**IPv6-only** address. The backup container runs in an IPv4-only environment, so
the direct host fails with `pg_dump: error: ... Network unreachable`. Use the
**Supavisor session-mode pooler** (IPv4) instead:

```
postgresql://postgres.<project-ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

- **User** is `postgres.<project-ref>` (the project ref is embedded in the username).
- **Host/region** come from the dashboard: Project Settings → Database → Connection string → **Session pooler**.
- **Port `5432` (session mode)**, not `6543` (transaction mode): `pg_dump` needs a
  persistent session, and transaction mode does not support prepared statements.

For local runs, put the four secrets in `.dev.vars` (git-ignored) in `KEY=value` form.

## Testing

- Unit tests: `npm test`
- Manual trigger after deploy: invoke the scheduled handler via the Cloudflare dashboard "Trigger" button, or `wrangler dev --test-scheduled` then hit `http://localhost:8787/__scheduled`.

## Postgres version

The container installs `postgresql17-client`, matching Supabase's Postgres 17.
`pg_dump`'s major version must be **>=** the server's, otherwise it aborts with
`server version mismatch`. If Supabase upgrades the server major, bump the
`apk add postgresql<major>-client` line in `container/Dockerfile` accordingly.

## Restoring a backup locally

To restore a `.dump` file (custom format) to a local Postgres 17 instance:

```bash
# Create the target database
createdb -U <user> neuralyn_restore

# Restore (--no-owner and --no-privileges avoid role conflicts)
pg_restore --no-owner --no-privileges -U <user> -d neuralyn_restore /path/to/backup.dump
```

### Expected errors during restore

The following errors are **expected and harmless** when restoring a Supabase dump into a standard (non-Supabase) Postgres installation:

| Error | Cause | Impact |
|---|---|---|
| `extension "supabase_vault" is not available` | `supabase_vault` is a Supabase-proprietary extension not available in standard Postgres. | The `vault` schema is not created. All other schemas (`public`, `auth`, `storage`, `realtime`) are fully restored. |
| `extension "supabase_vault" does not exist` | Cascades from the error above — a `COMMENT ON EXTENSION` statement references the extension that failed to install. | None. |
| `relation "vault.secrets" does not exist` | A trigger or foreign-key references the `vault.secrets` table, which was never created because `supabase_vault` is missing. | None — no application data depends on this table in a local development context. |

All 154 tables across `public`, `auth`, `realtime`, and `storage` schemas are restored successfully.

## Notes

- **Production wrangler config** is `wrangler.jsonc`, which contains the `containers[]` array for the custom Postgres backup container.
- **Test-only wrangler config** is `wrangler.test.jsonc`, used by `@cloudflare/vitest-pool-workers`. It omits the `containers[]` array because the bundled wrangler in pool-workers doesn't yet support it.
- **Implementation stub**: `src/worker.ts` was originally scaffolded as a stub but is now the real implementation. The early stub commit (`63d4f94`) remains in git history purely as scaffolding documentation.
