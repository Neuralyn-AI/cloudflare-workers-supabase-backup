// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { runPgDump } from "../container/src/dump";

function fakeProcess(stdoutChunks: Buffer[], stderrText: string, exitCode: number) {
  const proc = new EventEmitter() as any;
  proc.stdout = Readable.from(stdoutChunks);
  proc.stderr = Readable.from([Buffer.from(stderrText)]);
  proc.kill = vi.fn();
  setTimeout(() => proc.emit("exit", exitCode, null), 0);
  return proc;
}

describe("runPgDump", () => {
  it("invokes pg_dump with expected args and yields stdout chunks", async () => {
    (spawn as any).mockReturnValue(
      fakeProcess([Buffer.from("HEAD"), Buffer.from("TAIL")], "", 0)
    );

    const chunks: Buffer[] = [];
    const result = await runPgDump({
      databaseUrl: "postgres://u:p@h:5432/db",
      onChunk: (c) => { chunks.push(c); },
    });

    expect(spawn).toHaveBeenCalledWith("pg_dump", [
      "-Fc", "--no-owner", "--no-privileges", "-v",
      "-d", "postgres://u:p@h:5432/db",
    ], expect.any(Object));
    expect(Buffer.concat(chunks).toString()).toBe("HEADTAIL");
    expect(result.exitCode).toBe(0);
    expect(result.stderrTail).toBe("");
  });

  it("returns non-zero exit and tails stderr", async () => {
    const long = "x".repeat(3000) + "ERR_AT_END";
    (spawn as any).mockReturnValue(fakeProcess([], long, 1));

    const result = await runPgDump({
      databaseUrl: "postgres://x",
      onChunk: () => {},
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderrTail.endsWith("ERR_AT_END")).toBe(true);
    expect(result.stderrTail.length).toBeLessThanOrEqual(2048);
  });

  it("kills the process on abort signal", async () => {
    const proc = fakeProcess([Buffer.from("partial")], "", 0);
    (spawn as any).mockReturnValue(proc);

    const ac = new AbortController();
    const promise = runPgDump({
      databaseUrl: "postgres://x",
      onChunk: () => {},
      signal: ac.signal,
    });
    ac.abort();
    await promise.catch(() => {});

    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
