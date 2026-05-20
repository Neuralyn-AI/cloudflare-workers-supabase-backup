// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { streamToR2, type R2Config } from "../container/src/upload";

type Call = { cmd: string; input: any };

function fakeS3Client(calls: Call[], partOverrides: Record<number, string> = {}) {
  return {
    send: vi.fn(async (cmd: any) => {
      const name = cmd.constructor.name;
      calls.push({ cmd: name, input: cmd.input });
      if (name === "CreateMultipartUploadCommand") {
        return { UploadId: "UPLOAD-1" };
      }
      if (name === "UploadPartCommand") {
        const part = cmd.input.PartNumber as number;
        return { ETag: partOverrides[part] ?? `etag-${part}` };
      }
      if (name === "CompleteMultipartUploadCommand") return {};
      if (name === "AbortMultipartUploadCommand") return {};
      throw new Error(`unexpected command: ${name}`);
    }),
  };
}

const config: R2Config = {
  accountId: "acc",
  bucket: "bkt",
  accessKeyId: "ak",
  secretAccessKey: "sk",
  objectKey: "supabase-backups/2026/05/19/backup-...dump",
};

describe("streamToR2", () => {
  it("uploads parts in order and completes", async () => {
    const calls: Call[] = [];
    const client = fakeS3Client(calls);

    const result = await streamToR2(config, async (push) => {
      await push(Buffer.alloc(16 * 1024 * 1024, 1));
      await push(Buffer.alloc(8 * 1024 * 1024, 2));
    }, { client: client as any, partSize: 16 * 1024 * 1024 });

    expect(result.partsUploaded).toBe(2);
    expect(result.bytes).toBe(16 * 1024 * 1024 + 8 * 1024 * 1024);

    const names = calls.map((c) => c.cmd);
    expect(names[0]).toBe("CreateMultipartUploadCommand");
    expect(names.filter((n) => n === "UploadPartCommand")).toHaveLength(2);
    expect(names[names.length - 1]).toBe("CompleteMultipartUploadCommand");

    const completeCall = calls[calls.length - 1]!.input;
    expect(completeCall.MultipartUpload.Parts).toEqual([
      { PartNumber: 1, ETag: "etag-1" },
      { PartNumber: 2, ETag: "etag-2" },
    ]);
  });

  it("aborts when producer throws", async () => {
    const calls: Call[] = [];
    const client = fakeS3Client(calls);

    await expect(
      streamToR2(config, async () => { throw new Error("boom"); },
        { client: client as any, partSize: 16 * 1024 * 1024 })
    ).rejects.toThrow("boom");

    const names = calls.map((c) => c.cmd);
    expect(names).toContain("AbortMultipartUploadCommand");
    expect(names).not.toContain("CompleteMultipartUploadCommand");
  });

  it("flushes a final partial part", async () => {
    const calls: Call[] = [];
    const client = fakeS3Client(calls);

    const result = await streamToR2(config, async (push) => {
      await push(Buffer.alloc(1024, 9));
    }, { client: client as any, partSize: 16 * 1024 * 1024 });

    expect(result.partsUploaded).toBe(1);
    expect(result.bytes).toBe(1024);
  });
});
