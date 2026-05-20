import { buildObjectKey } from "./object-key.js";
import { sendFailureEmail } from "./notifier.js";
import type { RunRequest, RunResponse } from "./types.js";

export { BackupContainer } from "./container.js";

type Env = {
  BACKUP: DurableObjectNamespace;
  BACKUP_DATABASE_URL: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_PREFIX: string;
  MAIL_PROVIDER: "resend" | "smtp2go";
  MAIL_API_KEY: string;
  MAIL_FROM: string;
  MAIL_TO: string;
  BACKUP_TIMEOUT_MS: string;
};

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    await runBackup(event, env);
  },
};

async function runBackup(event: ScheduledEvent, env: Env) {
  const startedAt = Date.now();
  const timeoutMs = Number(env.BACKUP_TIMEOUT_MS) || 1_500_000;
  const objectKey = buildObjectKey(env.R2_PREFIX, new Date(event.scheduledTime));

  const reqBody: RunRequest = {
    databaseUrl: env.BACKUP_DATABASE_URL,
    r2: {
      accountId: env.R2_ACCOUNT_ID,
      bucket: env.R2_BUCKET,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      objectKey,
    },
    timeoutMs,
  };

  const stub = env.BACKUP.get(env.BACKUP.idFromName("singleton"));
  const fetchTimeout = AbortSignal.timeout(timeoutMs + 60_000);

  let response: RunResponse;
  try {
    const res = await stub.fetch("http://container/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
      signal: fetchTimeout,
    });
    response = (await res.json()) as RunResponse;
  } catch (err) {
    response = {
      ok: false,
      stage: "spawn",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (response.ok) {
    console.log(JSON.stringify({
      msg: "backup ok",
      objectKey,
      bytes: response.bytes,
      durationMs: response.durationMs,
      partsUploaded: response.partsUploaded,
      pgDumpVersion: response.pgDumpVersion,
    }));
    return;
  }

  console.error(JSON.stringify({
    msg: "backup failed",
    objectKey,
    stage: response.stage,
    message: response.message,
    exitCode: response.exitCode,
    stderrTail: response.stderrTail,
    durationMs: Date.now() - startedAt,
  }));

  await sendFailureEmail(
    {
      provider: env.MAIL_PROVIDER,
      apiKey: env.MAIL_API_KEY,
      from: env.MAIL_FROM,
      to: env.MAIL_TO,
    },
    {
      subject: `Supabase backup failed (${response.stage})`,
      body: [
        `Supabase backup failed at ${new Date(event.scheduledTime).toISOString()}`,
        `objectKey=${objectKey}`,
        `stage=${response.stage}`,
        `message=${response.message}`,
        response.exitCode != null ? `exitCode=${response.exitCode}` : null,
        response.stderrTail ? `stderrTail:\n${response.stderrTail}` : null,
      ].filter(Boolean).join("\n"),
    }
  );
}
