import { Hono } from "hono";
import { runPgDump } from "./dump.js";
import { streamToR2 } from "./upload.js";
import { spawnSync } from "node:child_process";

type RunRequest = {
  databaseUrl: string;
  r2: {
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    objectKey: string;
  };
  timeoutMs: number;
};

const app = new Hono();

app.get("/health", (c) => c.text("ok"));

app.post("/run", async (c) => {
  const req = (await c.req.json()) as RunRequest;
  const startedAt = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), req.timeoutMs);

  let dumpExit = 0;
  let stderrTail = "";

  try {
    const result = await streamToR2(req.r2, async (push) => {
      const r = await runPgDump({
        databaseUrl: req.databaseUrl,
        signal: ac.signal,
        onChunk: async (chunk) => { await push(chunk); },
      });
      dumpExit = r.exitCode;
      stderrTail = r.stderrTail;
      if (r.exitCode !== 0) {
        throw new Error(`pg_dump exited ${r.exitCode}`);
      }
    });

    clearTimeout(timer);

    return c.json({
      ok: true,
      bytes: result.bytes,
      durationMs: Date.now() - startedAt,
      objectKey: req.r2.objectKey,
      pgDumpVersion: detectPgDumpVersion(),
      partsUploaded: result.partsUploaded,
    });
  } catch (err) {
    clearTimeout(timer);
    const stage: "dump" | "upload" | "timeout" =
      ac.signal.aborted ? "timeout"
      : dumpExit !== 0 ? "dump"
      : "upload";
    return c.json({
      ok: false,
      stage,
      message: err instanceof Error ? err.message : String(err),
      exitCode: dumpExit || undefined,
      stderrTail: stderrTail || undefined,
    });
  }
});

function detectPgDumpVersion(): string {
  const r = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
  return (r.stdout || "").trim();
}

const port = Number(process.env.PORT ?? 8080);
import("@hono/node-server").then(({ serve }) => {
  serve({ fetch: app.fetch, port });
  console.log(JSON.stringify({ msg: "container listening", port }));
});
