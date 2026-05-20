# neuralyn-supabase-backup

Automated Supabase Postgres backup to Cloudflare R2, every 6 hours.

## Architecture

See [docs/superpowers/specs/2026-05-19-supabase-backup-design.md](docs/superpowers/specs/2026-05-19-supabase-backup-design.md).

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

## Testing

- Unit tests: `npm test`
- Manual trigger after deploy: invoke the scheduled handler via the Cloudflare dashboard "Trigger" button, or `wrangler dev --test-scheduled` then hit `http://localhost:8787/__scheduled`.

## Restore

```bash
aws s3 cp --endpoint-url=https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com \
  s3://$R2_BUCKET/supabase-backups/2026/05/19/backup-2026-05-19T18-00-00Z.dump \
  ./backup.dump

# Inspect contents
pg_restore -l ./backup.dump

# Restore into a target database
pg_restore -d "$RESTORE_URL" --no-owner --no-privileges -j 4 ./backup.dump
```

## Postgres version

Container uses `postgresql16-client`. If Supabase upgrades to Postgres 17+, update the `apk add postgresql<major>-client` line in `container/Dockerfile`.

## Notes

- **Production wrangler config** is `wrangler.jsonc`, which contains the `containers[]` array for the custom Postgres backup container.
- **Test-only wrangler config** is `wrangler.test.jsonc`, used by `@cloudflare/vitest-pool-workers`. It omits the `containers[]` array because the bundled wrangler in pool-workers doesn't yet support it.
- **Implementation stub**: `src/worker.ts` was originally scaffolded as a stub but is now the real implementation. The early stub commit (`63d4f94`) remains in git history purely as scaffolding documentation.
