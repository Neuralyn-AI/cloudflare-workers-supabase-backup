import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../src/worker";
import type { RunResponse } from "../src/types";

type Env = {
  BACKUP: any;
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

function makeEnv(containerResponse: RunResponse | Error): Env {
  const fetcher = {
    fetch: vi.fn(async () => {
      if (containerResponse instanceof Error) throw containerResponse;
      return new Response(JSON.stringify(containerResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  };
  return {
    BACKUP: {
      idFromName: () => "id-1",
      get: () => fetcher,
    },
    BACKUP_DATABASE_URL: "postgres://u:p@h:5432/db",
    R2_ACCOUNT_ID: "acc",
    R2_BUCKET: "bkt",
    R2_ACCESS_KEY_ID: "ak",
    R2_SECRET_ACCESS_KEY: "sk",
    R2_PREFIX: "supabase-backups/",
    MAIL_PROVIDER: "resend",
    MAIL_API_KEY: "mk",
    MAIL_FROM: "from@x",
    MAIL_TO: "to@x",
    BACKUP_TIMEOUT_MS: "1500000",
  };
}

describe("worker scheduled handler", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("invokes container and does NOT send email on success", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const env = makeEnv({
      ok: true, bytes: 100, durationMs: 1000, objectKey: "k",
      pgDumpVersion: "pg_dump 16.0", partsUploaded: 1,
    });

    await worker.scheduled(
      { scheduledTime: Date.UTC(2026, 4, 19, 6, 0, 0), cron: "0 */6 * * *" } as any,
      env as any,
      { waitUntil: (p: Promise<unknown>) => p } as any
    );

    expect(env.BACKUP.get(env.BACKUP.idFromName("singleton")).fetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends email on container failure response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const env = makeEnv({
      ok: false, stage: "dump", message: "pg_dump exited 1",
      exitCode: 1, stderrTail: "FATAL: connection refused",
    });

    await worker.scheduled(
      { scheduledTime: Date.UTC(2026, 4, 19, 6, 0, 0), cron: "0 */6 * * *" } as any,
      env as any,
      { waitUntil: (p: Promise<unknown>) => p } as any
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body);
    expect(body.subject).toMatch(/Supabase backup failed/);
    expect(body.text).toContain("stage=dump");
    expect(body.text).toContain("FATAL: connection refused");
  });

  it("sends email when container fetch throws", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const env = makeEnv(new Error("network down"));

    await worker.scheduled(
      { scheduledTime: Date.UTC(2026, 4, 19, 6, 0, 0), cron: "0 */6 * * *" } as any,
      env as any,
      { waitUntil: (p: Promise<unknown>) => p } as any
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.text).toContain("network down");
  });
});
