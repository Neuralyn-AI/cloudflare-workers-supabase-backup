import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendFailureEmail, type NotifierConfig } from "../src/notifier";

const baseConfig: Omit<NotifierConfig, "provider"> = {
  apiKey: "test-key",
  from: "backups@example.com",
  to: "ops@example.com",
};

describe("sendFailureEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to Resend with bearer auth and JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendFailureEmail(
      { ...baseConfig, provider: "resend" },
      { subject: "Backup failed", body: "stage=dump" }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe("Bearer test-key");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const payload = JSON.parse(init.body);
    expect(payload).toEqual({
      from: "backups@example.com",
      to: ["ops@example.com"],
      subject: "Backup failed",
      text: "stage=dump",
    });
  });

  it("posts to SMTP2GO with api_key in body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendFailureEmail(
      { ...baseConfig, provider: "smtp2go" },
      { subject: "Backup failed", body: "stage=upload" }
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.smtp2go.com/v3/email/send");
    const payload = JSON.parse(init.body);
    expect(payload).toEqual({
      api_key: "test-key",
      sender: "backups@example.com",
      to: ["ops@example.com"],
      subject: "Backup failed",
      text_body: "stage=upload",
    });
  });

  it("splits comma-separated recipients", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendFailureEmail(
      { ...baseConfig, provider: "resend", to: "a@x.com, b@x.com" },
      { subject: "s", body: "b" }
    );

    const payload = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(payload.to).toEqual(["a@x.com", "b@x.com"]);
  });

  it("throws when provider returns non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 }))
    );

    await expect(
      sendFailureEmail(
        { ...baseConfig, provider: "resend" },
        { subject: "s", body: "b" }
      )
    ).rejects.toThrow(/notifier failed.*500/);
  });
});
