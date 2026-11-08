import { describe, expect, it, vi } from "vitest";
import {
  appUrl,
  escapeHtml,
  meterShares,
  renderEmail,
  type EmailContent,
} from "@/lib/email/layout";
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

describe("Ledger email layout (decisions.md 2026-11-08)", () => {
  it("puts a hidden preview line first, defaulting to the first paragraph", () => {
    const { html } = renderEmail({ ...content, preheader: "Your code is 123456." }, brand);
    expect(html).toMatch(/<div style="display:none;[^"]*">Your code is 123456\./);
    expect(renderEmail(content, brand).html).toMatch(
      /<div style="display:none;[^"]*">Your FY2027 budget request was submitted\./,
    );
  });

  it("shows the status as a chip in words, coloured by tone", () => {
    expect(renderEmail({ ...content, tone: "good" }, brand).html).toMatch(
      /background:#e7f4ec;color:#16794a;[^>]*>Submitted</,
    );
    // Something to do and no tone given: the waiting colour.
    expect(renderEmail({ ...content, action: "Answer it." }, brand).html).toMatch(
      /background:#fff2dc;color:#8a4b00;[^>]*>Submitted</,
    );
  });

  it("leaves 'Nothing, this is for your records' to the text version", () => {
    const { text, html } = renderEmail(content, brand);
    expect(text).toContain("What you need to do: Nothing, this is for your records.");
    expect(html).not.toContain("Nothing, this is for your records.");
    expect(renderEmail({ ...content, action: "Answer it." }, brand).html).toContain(
      "What you need to do:</strong> Answer it.",
    );
  });

  it("shows a code in one box, so it copies as one number", () => {
    const { text, html } = renderEmail({ ...content, code: "169964" }, brand);
    expect(text).toContain("Code: 169964");
    expect(html).toMatch(/letter-spacing:0\.3em;[^>]*>169964</);
  });

  it("shows the big number, the steps and who wrote the note", () => {
    const { text, html } = renderEmail(
      {
        ...content,
        eyebrow: "Media Team · FY2027 · IFC-2027-0007",
        hero: { value: "$4,820.00", caption: "you asked for $5,200.00" },
        steps: [
          { label: "Submitted", detail: "Oct 28", state: "done" },
          { label: "Question", state: "current" },
          { label: "Decision", state: "next" },
        ],
        note: { label: "Question", text: "Can you split it?", author: "Grace Mensah" },
      },
      { ...brand, accent: "#6b46d9" },
    );
    expect(text).toContain("Media Team · FY2027 · IFC-2027-0007");
    expect(text).toContain("$4,820.00\nyou asked for $5,200.00");
    expect(text).toContain("Where it stands: Submitted Oct 28 → Question (Now) → Decision");
    expect(text).toContain("Question (Grace Mensah):\nCan you split it?");
    expect(html).toContain(">GM<");
    expect(html).toContain("Grace Mensah · Question");
    // The current step is drawn in the church's accent.
    expect(html).toMatch(/background:#6b46d9;">&nbsp;<\/div><p[^>]*>Question</);
  });

  it("shows the logo beside the names, and the button in the accent", () => {
    const { html } = renderEmail(content, {
      ...brand,
      logoUrl: "https://budget.example.org/brand/logo.png",
      accent: "#2860c0",
    });
    expect(html).toContain('src="https://budget.example.org/brand/logo.png"');
    expect(html).toContain('alt="Immanuel Fellowship Church"');
    expect(html).toContain("background:#2860c0;color:#ffffff");
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

describe("budget bar, people and a second button", () => {
  it("splits the bar into whole percents adding to 100, keeping small parts visible", () => {
    expect(meterShares([390_410, 41_237, 218_353])).toEqual([60, 6, 34]);
    expect(meterShares([100_000, 1, 99_999]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(meterShares([100_000, 1, 99_999])[1]).toBe(2);
    expect(meterShares([500, 100, -50])).toEqual([83, 17, 0]);
    expect(meterShares([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("names every part of the bar and every person in words, in both versions", () => {
    const { text, html } = renderEmail(
      {
        ...content,
        meter: {
          heading: "Youth Ministry FY2027 budget · $6,500.00",
          parts: [
            { label: "Spent and committed", value: "$3,904.10", cents: 390_410, kind: "used" },
            { label: "This expense", value: "$412.37", cents: 41_237, kind: "this" },
            { label: "Left after this", value: "$2,183.53", cents: 218_353, kind: "left" },
          ],
        },
        people: {
          heading: "Approvals",
          items: [
            { name: "Grace Mensah (Accountant)", status: "Waiting" },
            { name: "David Chen (Board Chair)", status: "Approved", tone: "good" },
          ],
        },
        secondaryButton: { label: "Other choices", href: "https://budget.example.org/x" },
      },
      { ...brand, accent: "#6b46d9" },
    );
    expect(text).toContain(
      "Youth Ministry FY2027 budget · $6,500.00:\n- Spent and committed: $3,904.10\n- This expense: $412.37\n- Left after this: $2,183.53",
    );
    expect(text).toContain(
      "Approvals:\n- Grace Mensah (Accountant): Waiting\n- David Chen (Board Chair): Approved",
    );
    expect(text).toContain("Other choices: https://budget.example.org/x");
    expect(html).toContain(
      '<td width="6%" style="height:10px;line-height:10px;font-size:0;background:#6b46d9;">',
    );
    expect(html).toContain("Left after this");
    expect(html).toMatch(/background:#e7f4ec;color:#16794a;[^>]*>Approved</);
    expect(html).toMatch(/href="https:\/\/budget\.example\.org\/x"[^>]*>Other choices</);
  });
});
