import { spawn } from "node:child_process";

export type RunPgDumpArgs = {
  databaseUrl: string;
  onChunk: (chunk: Buffer) => void;
  signal?: AbortSignal;
};

export type RunPgDumpResult = {
  exitCode: number;
  stderrTail: string;
};

const STDERR_TAIL_MAX = 2048;

export async function runPgDump(args: RunPgDumpArgs): Promise<RunPgDumpResult> {
  const proc = spawn(
    "pg_dump",
    ["-Fc", "--no-owner", "--no-privileges", "-v", "-d", args.databaseUrl],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let stderrBuf = "";

  proc.stdout!.on("data", (chunk: Buffer) => args.onChunk(chunk));
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
      proc.on("exit", (code) => resolve(code ?? 1));
      proc.on("error", reject);
    });
    return { exitCode, stderrTail: stderrBuf };
  } finally {
    if (args.signal) args.signal.removeEventListener("abort", abortHandler);
  }
}
