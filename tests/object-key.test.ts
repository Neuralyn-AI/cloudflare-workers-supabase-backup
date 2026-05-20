import { describe, it, expect } from "vitest";
import { buildObjectKey } from "../src/object-key";

describe("buildObjectKey", () => {
  it("formats date components with zero-padding and Z suffix", () => {
    const date = new Date(Date.UTC(2026, 4, 19, 6, 0, 0));
    expect(buildObjectKey("supabase-backups/", date)).toBe(
      "supabase-backups/2026/05/19/backup-2026-05-19T06-00-00Z.dump"
    );
  });

  it("respects custom prefix without leading slash", () => {
    const date = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    expect(buildObjectKey("foo/", date)).toBe(
      "foo/2026/01/01/backup-2026-01-01T00-00-00Z.dump"
    );
  });

  it("adds trailing slash to prefix when missing", () => {
    const date = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    expect(buildObjectKey("foo", date)).toBe(
      "foo/2026/01/01/backup-2026-01-01T00-00-00Z.dump"
    );
  });
});
