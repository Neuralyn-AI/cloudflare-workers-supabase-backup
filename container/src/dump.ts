import { spawn } from "node:child_process";

export type RunPgDumpArgs = {
  databaseUrl: string;
  onChunk: (chunk: Buffer) => Promise<void> | void;
  signal?: AbortSignal;
};

export type RunPgDumpResult = {
  exitCode: number;
  stderrTail: string;
};

const STDERR_TAIL_MAX = 2048;

function parseDatabaseUrl(url: string): Record<string, string> {
  const u = new URL(url);
  const env: Record<string, string> = {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, ""),
  };
  const sslmode = u.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

function sanitizeStderr(raw: string): string {
  return raw.replace(/postgres(?:ql)?:\/\/[^@\s]*@/gi, "postgres://***@");
}

export async function runPgDump(args: RunPgDumpArgs): Promise<RunPgDumpResult> {
  const pgEnv = parseDatabaseUrl(args.databaseUrl);

  const proc = spawn(
    "pg_dump",
    ["-Fc", "--no-owner", "--no-privileges", "-v"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...pgEnv },
    }
  );

  let stderrBuf = "";

  proc.stdout!.on("data", async (chunk: Buffer) => {
    proc.stdout!.pause();
    try {
      await args.onChunk(chunk);
    } finally {
      proc.stdout!.resume();
    }
  });
  proc.stderr!.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString("utf8");
    if (stderrBuf.length > STDERR_TAIL_MAX) {
      stderrBuf = stderrBuf.slice(-STDERR_TAIL_MAX);
    }
  });

  const abortHandler = () => proc.kill("SIGTERM");
  if (args.signal) args.signal.addEventListener("abort", abortHandler, { once: true });

  try {
    const exitCode: number = await new Promise((resolve, reject) => {
      proc.on("exit", (code) => {
        if (args.signal?.aborted) {
          reject(new Error("aborted"));
        } else {
          resolve(code ?? 1);
        }
      });
      proc.on("error", reject);
    });
    return { exitCode, stderrTail: sanitizeStderr(stderrBuf) };
  } finally {
    if (args.signal) args.signal.removeEventListener("abort", abortHandler);
  }
}
