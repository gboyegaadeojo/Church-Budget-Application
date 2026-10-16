import { describe, expect, it, vi } from "vitest";
import { appUrl, escapeHtml, renderEmail, type EmailContent } from "@/lib/email/layout";
import { MAX_ATTEMPTS, retryDelayMs } from "@/lib/email/outbox";
import { ResendEmailSender } from "@/lib/email/resend";

const brand = { churchName: "Immanuel Fellowship Church", appName: "Church Budget" };

const content: EmailContent = {
  subject: "Budget received: Media Team FY2027 (IFC-2027-0007)",
  heading: "We received your budget request",
  status: "Submitted",
  paragraphs: ["Your FY2027 budget request was submitted."],
  facts: [{ label: "Reference", value: "IFC-2027-0007" }],
  summary: {
    kind: "single",
    totals: { subtotal: 102_500, tax: 12_300, total: 114_800 },
    rate: "0.1200",
  },
  lines: {
    heading: "Items",
    items: [{ name: "Mixer", quantity: 1, unitPriceCents: 102_500, totalCents: 102_500 }],
  },
  action: "Nothing, this is for your records.",
  button: { label: "View request", href: "https://budget.example.org/annual/abc" },
};

describe("email layout (DRD 7.5)", () => {
  it("shows Subtotal, Sales tax and Total in both versions", () => {
    const email = renderEmail(content, brand);
    for (const body of [email.text, email.html]) {
      expect(body).toContain("Subtotal");
      expect(body).toContain("$1,025.00");
      expect(body).toContain("Sales tax (12%)");
      expect(body).toContain("$123.00");
      expect(body).toContain("Total (incl. tax)");
      expect(body).toContain("$1,148.00");
    }
  });

  it("has the status in words, what to do, and the link as a button and plain text", () => {
    const { text, html } = renderEmail(content, brand);
    expect(text).toContain("Status: Submitted");
    expect(text).toContain("What you need to do: Nothing, this is for your records.");
    expect(text).toContain("View request: https://budget.example.org/annual/abc");
    expect(html.match(/href="https:\/\/budget\.example\.org\/annual\/abc"/g)).toHaveLength(2);
    expect(html).toContain('lang="en-CA"');
    expect(html).toContain("max-width:600px");
  });

  it("shows requested beside approved and the difference", () => {
    const { text, html } = renderEmail(
      {
        ...content,
        summary: {
          kind: "comparison",
          requested: { subtotal: 3_000_000, tax: 360_000, total: 3_360_000 },
          approved: { subtotal: 2_678_571, tax: 321_429, total: 3_000_000 },
          rate: "0.1200",
          difference: "$3,600.00 less than requested",
        },
      },
      brand,
    );
    expect(text).toContain("Total (incl. tax): Requested $33,600.00 · Approved $30,000.00");
    expect(text).toContain("Difference: $3,600.00 less than requested");
    expect(html).toContain("$26,785.71");
  });

  it("escapes everything people typed", () => {
    const { html } = renderEmail(
      { ...content, note: { label: "Reason", text: `<script>alert("x")</script> & more` } },
      brand,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more");
    expect(escapeHtml(`'`)).toBe("&#39;");
  });

  it("shows a list under its own heading, apart from what changed", () => {
    const { text, html } = renderEmail(
      {
        ...content,
        changes: ["Title changed"],
        list: { heading: "Not submitted", items: ["Ushering Team", "Choir"] },
      },
      brand,
    );
    expect(text).toContain("What changed:\n- Title changed");
    expect(text).toContain("Not submitted:\n- Ushering Team\n- Choir");
    expect(html).toContain("<li>Ushering Team</li>");
  });

  it("keeps the subject on one line", () => {
    expect(renderEmail({ ...content, subject: "A\r\nBcc: someone" }, brand).subject).toBe(
      "A Bcc: someone",
    );
  });

  it("builds absolute app links without data in the query string", () => {
    expect(appUrl("/annual/abc", "https://budget.example.org")).toBe(
      "https://budget.example.org/annual/abc",
    );
  });
});

describe("retry backoff", () => {
  it("waits longer after each try and honours Retry-After", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(5 * 60_000);
    expect(retryDelayMs(4)).toBe(60 * 60_000);
    expect(retryDelayMs(MAX_ATTEMPTS)).toBe(24 * 60 * 60_000);
    expect(retryDelayMs(1, 3600)).toBe(3_600_000);
  });
});

describe("Resend sender", () => {
  const message = { id: "row-1", to: "sam@example.org", subject: "S", text: "T", html: "<p>H</p>" };

  function sender(response: Response | Error) {
    const fetch = vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    });
    return {
      fetch,
      sender: new ResendEmailSender({ apiKey: "re_test", from: "budget@example.org", fetch }),
    };
  }

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });

  it("sends with the row id as the idempotency key", async () => {
    const { fetch, sender: s } = sender(json(200, { id: "re_123" }));
    expect(await s.send(message)).toEqual({ kind: "sent", providerMessageId: "re_123" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test",
      "Idempotency-Key": "row-1",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "budget@example.org",
      to: ["sam@example.org"],
      subject: "S",
      text: "T",
      html: "<p>H</p>",
    });
  });

  it("treats rate limits and the daily quota as retry later", async () => {
    const { sender: s } = sender(
      json(429, { name: "daily_quota_exceeded", message: "Quota" }, { "retry-after": "7200" }),
    );
    expect(await s.send(message)).toMatchObject({ kind: "retry", retryAfterSeconds: 7200 });
  });

  it("retries outages, network errors and key or domain problems", async () => {
    expect((await sender(json(503, {})).sender.send(message)).kind).toBe("retry");
    expect((await sender(new Error("ECONNRESET")).sender.send(message)).kind).toBe("retry");
    expect((await sender(json(403, { name: "validation_error" })).sender.send(message)).kind).toBe(
      "retry",
    );
  });

  it("marks an email the provider refuses as failed", async () => {
    const result = await sender(
      json(422, { name: "validation_error", message: "Invalid `to`" }),
    ).sender.send(message);
    expect(result).toEqual({ kind: "failed", error: "Resend 422 validation_error: Invalid `to`" });
  });
});
