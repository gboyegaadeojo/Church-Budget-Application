import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appSettings,
  auditEvents,
  budgetRequests,
  deadlineExtensions,
  departments,
  requestRevisions,
  userDepartments,
  userRoles,
  users,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { departmentPicker, getRequestView, listMyRequests } from "@/domain/annual/queries";
import {
  deleteDraft,
  reviseRequest,
  saveDraft,
  startRequest,
  submitRequest,
} from "@/domain/annual/service";
import type { RequestContentInput } from "@/domain/annual/schema";
import { ConflictError, RuleError, ValidationError } from "@/domain/errors";
import { annualRequesterTasks } from "@/domain/tasks/annual";
import { loadViewer } from "@/domain/users/viewer";
import { ForbiddenError, type Subject } from "@/lib/authz";
import type { Viewer } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z"); // before the fixture deadline, 2026-11-30

let t: TestDb;
let db: Db;
let admin: Subject;
let cycleId: string;

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

/** A verified Group Leader with the Requester role and no department yet. */
async function newLeader(extra: Partial<typeof users.$inferInsert> = {}): Promise<Subject> {
  const row = await insertUser(db, {
    pcoLeaderVerified: true,
    pcoVerifiedAt: NOW,
    accessStatus: "pending_department",
    ...extra,
  });
  await db.insert(userRoles).values({ userId: row.id, role: "requester" });
  return { id: row.id, roles: ["requester"], departments: [] };
}

/** The person as the app sees them now (departments included). */
async function fresh(subject: Subject): Promise<Viewer> {
  const result = await loadViewer(db, subject.id);
  if (!result.ok) throw new Error(`No viewer: ${result.reason}`);
  return result.viewer;
}

async function requestRow(id: string) {
  const [row] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, id));
  return row;
}

const MIXER: RequestContentInput = {
  title: "Sound desk upgrade",
  justification: "The old desk drops channels during services.",
  lines: [
    { name: "Mixer", quantity: "1", unitPrice: "1,025.00", link: "https://example.com/mixer" },
  ],
};

/** A leader, their new department and a draft with content, ready to submit. */
async function readyDraft(content: RequestContentInput = MIXER) {
  const leader = await newLeader();
  const dept = await insertDepartment(db);
  const { requestId } = await run((tx) =>
    startRequest(tx, leader, { cycleId, departmentId: dept.id }),
  );
  const me = await fresh(leader);
  const saved = await run((tx) => saveDraft(tx, me, { id: requestId, version: 1, ...content }));
  return { me, dept, requestId, version: saved.version };
}

async function submit(me: Subject, requestId: string, version: number, key = randomUUID()) {
  return run((tx) =>
    submitRequest(tx, me, { id: requestId, version, idempotencyKey: key }, { now: NOW }),
  );
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  const row = await insertUser(db, { accessStatus: "active" });
  await db.insert(userRoles).values({ userId: row.id, role: "system_admin" });
  admin = { id: row.id, roles: ["system_admin"], departments: [] };
  cycleId = (await insertCycle(db, admin.id)).id;
});

afterAll(async () => {
  await t?.close();
});

describe("starting a request (FR-03, FR-38)", () => {
  it("AC-20 creates a draft; the first leader to pick a department becomes its Primary", async () => {
    const leader = await newLeader();
    const dept = await insertDepartment(db);
    const result = await run((tx) => startRequest(tx, leader, { cycleId, departmentId: dept.id }));
    expect(result.existing).toBe(false);
    expect(await requestRow(result.requestId)).toMatchObject({
      status: "draft",
      departmentNameSnapshot: dept.name,
      referenceNumber: null,
      taxRate: null,
    });
    const me = await fresh(leader); // no longer "waiting for a department"
    expect(me.departments).toEqual([
      { id: dept.id, name: dept.name, representativeType: "primary" },
    ]);
  });

  it("AC-60 a second leader joins as Representative and is sent to the same request", async () => {
    const { requestId, dept } = await readyDraft();
    const second = await newLeader();
    const result = await run((tx) => startRequest(tx, second, { cycleId, departmentId: dept.id }));
    // Still a draft, so it opens in the editor.
    expect(result).toEqual({ requestId, departmentId: dept.id, existing: true, open: "edit" });
    expect((await fresh(second)).departments[0].representativeType).toBe("representative");
    const [joined] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "admin.department_leader_joined"),
          eq(auditEvents.actorUserId, second.id),
        ),
      );
    expect(joined.details).toMatchObject({
      source: "form_pick",
      after: { slot: "representative" },
    });
  });

  it("rule 1 a department has one budget a cycle: after submitting, starting again opens it", async () => {
    const { me, dept, requestId, version } = await readyDraft();
    await submit(me, requestId, version);
    const again = await run((tx) => startRequest(tx, me, { cycleId, departmentId: dept.id }));
    // Submitted: it opens on its page to review, never a second request.
    expect(again).toEqual({ requestId, departmentId: dept.id, existing: true, open: "view" });
    // The database refuses a second request for the same department and cycle too.
    await expect(
      db.insert(budgetRequests).values({
        budgetCycleId: cycleId,
        departmentId: dept.id,
        requesterUserId: me.id,
        departmentNameSnapshot: dept.name,
        title: "",
      }),
    ).rejects.toThrow();
  });

  it("rule 1 a leader of two departments starts the other's budget; a decided one only opens to view", async () => {
    const { me, dept, requestId, version } = await readyDraft();
    await submit(me, requestId, version);
    // The same leader also leads a department with no budget yet: a new draft for it.
    const other = await insertDepartment(db);
    const second = await run((tx) => startRequest(tx, me, { cycleId, departmentId: other.id }));
    expect(second).toMatchObject({ existing: false, open: "edit", departmentId: other.id });
    expect(second.requestId).not.toBe(requestId);

    // The picker tells them what the first department's budget allows.
    const leader = await fresh(me);
    const picker = await departmentPicker(db, leader, cycleId);
    expect(picker.choices.find((c) => c.id === dept.id)?.existing).toMatchObject({
      requestId,
      status: "submitted",
      editsLeft: 2,
      editable: true,
    });
    // Once approved it can't be changed: picking it opens it to view.
    await db
      .update(budgetRequests)
      .set({
        status: "approved",
        approvedSubtotalCents: 102_500,
        approvedTaxCents: 12_300,
        approvedTotalCents: 114_800,
      })
      .where(eq(budgetRequests.id, requestId));
    const after = await departmentPicker(db, leader, cycleId);
    expect(after.choices.find((c) => c.id === dept.id)?.existing).toMatchObject({
      status: "approved",
      editable: false,
    });
    const again = await run((tx) => startRequest(tx, leader, { cycleId, departmentId: dept.id }));
    expect(again).toMatchObject({ requestId, existing: true, open: "view" });
  });

  it("AC-14 typing a new name creates a Proposed department; a known name reuses it", async () => {
    const leader = await newLeader();
    const result = await run((tx) =>
      startRequest(tx, leader, { cycleId, otherName: "  Media   Ministri " }),
    );
    const [dept] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, result.departmentId));
    expect(dept).toMatchObject({
      name: "Media Ministri",
      status: "proposed",
      proposedByUserId: leader.id,
    });

    const known = await insertDepartment(db, { name: "Greeting Team" });
    const other = await newLeader();
    const reused = await run((tx) =>
      startRequest(tx, other, { cycleId, otherName: "greeting team" }),
    );
    expect(reused.departmentId).toBe(known.id);
  });

  it("AC-22 requires a department and an open cycle", async () => {
    const leader = await newLeader();
    await expect(run((tx) => startRequest(tx, leader, { cycleId }))).rejects.toMatchObject({
      fieldErrors: { departmentId: expect.any(String) },
    });
    const closed = await insertCycle(db, admin.id, {
      budgetYear: 2031,
      name: "FY2031",
      status: "closed",
    });
    const dept = await insertDepartment(db);
    await expect(
      run((tx) => startRequest(tx, leader, { cycleId: closed.id, departmentId: dept.id })),
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("refuses people who aren't verified Group Leaders, and inactive departments", async () => {
    const unverified = await newLeader({ pcoLeaderVerified: false });
    const dept = await insertDepartment(db);
    await expect(
      run((tx) => startRequest(tx, unverified, { cycleId, departmentId: dept.id })),
    ).rejects.toBeInstanceOf(RuleError);
    const leader = await newLeader();
    const inactive = await insertDepartment(db, { status: "inactive" });
    await expect(
      run((tx) => startRequest(tx, leader, { cycleId, departmentId: inactive.id })),
    ).rejects.toMatchObject({ fieldErrors: { departmentId: expect.any(String) } });
    await expect(
      run((tx) => startRequest(tx, admin, { cycleId, departmentId: dept.id })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("drafts (FR-05 to FR-09)", () => {
  it("AC-21 saves and resumes a draft without using an edit or creating a version", async () => {
    const { me, requestId, version } = await readyDraft();
    const view = await getRequestView(db, me, requestId);
    expect(view).toMatchObject({
      status: "draft",
      version,
      title: "Sound desk upgrade",
      editCount: 0,
      editsRemaining: 2,
      rate: "0.1200",
      totals: { subtotal: 102_500, tax: 12_300, total: 114_800 },
      lines: [
        {
          name: "Mixer",
          quantity: 1,
          unitPriceCents: 102_500,
          link: "https://example.com/mixer",
          notes: null,
        },
      ],
    });
    const revisions = await db
      .select()
      .from(requestRevisions)
      .where(eq(requestRevisions.budgetRequestId, requestId));
    expect(revisions).toHaveLength(0);
  });

  it("keeps unfinished lines: an empty quantity is 1, an empty price $0.00, blank rows are dropped", async () => {
    const { me, requestId, version } = await readyDraft();
    const saved = await run((tx) =>
      saveDraft(tx, me, {
        id: requestId,
        version,
        title: "",
        justification: "",
        lines: [{ name: "Cables" }, { name: "", quantity: "", unitPrice: "", link: "", notes: "" }],
      }),
    );
    expect(saved.totals.total).toBe(0);
    expect((await getRequestView(db, me, requestId))?.lines).toEqual([
      { name: "Cables", quantity: 1, unitPriceCents: 0, link: null, notes: null },
    ]);
  });

  it("AC-24 rejects a bad quantity, a negative or huge price, and a malformed link", async () => {
    const { me, requestId, version } = await readyDraft();
    const bad = [
      { name: "A", quantity: "0" },
      { name: "B", quantity: "1.5" },
      { name: "C", unitPrice: "-5" },
      { name: "D", unitPrice: "1,000,000.01" },
      { name: "E", link: "javascript:alert(1)" },
      { name: "F", link: "ftp://example.com/file" },
      { name: "G", quantity: "10001" },
    ];
    const error = await run((tx) =>
      saveDraft(tx, me, { id: requestId, version, ...MIXER, lines: bad }),
    ).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ValidationError);
    expect(Object.keys((error as ValidationError).fieldErrors).sort()).toEqual([
      "lines.0.quantity",
      "lines.1.quantity",
      "lines.2.unitPrice",
      "lines.3.unitPrice",
      "lines.4.link",
      "lines.5.link",
      "lines.6.quantity",
    ]);
  });

  it("AC-26 AC-27 AC-30 AC-31 AC-32 AC-33 recalculates every total on the server", async () => {
    const cases: [string[], { subtotal: number; tax: number; total: number }][] = [
      [["30,000.00"], { subtotal: 3_000_000, tax: 360_000, total: 3_360_000 }],
      [["1,025.00"], { subtotal: 102_500, tax: 12_300, total: 114_800 }],
      [["10.04"], { subtotal: 1_004, tax: 120, total: 1_124 }],
      [["10.29"], { subtotal: 1_029, tax: 123, total: 1_152 }],
      [["10.46"], { subtotal: 1_046, tax: 126, total: 1_172 }],
      // Tax once on the subtotal: $20.08 × 12% = $2.41, not $1.20 + $1.20.
      [["10.04", "10.04"], { subtotal: 2_008, tax: 241, total: 2_249 }],
    ];
    for (const [prices, expected] of cases) {
      const { me, requestId, version } = await readyDraft();
      const saved = await run((tx) =>
        saveDraft(tx, me, {
          id: requestId,
          version,
          ...MIXER,
          lines: prices.map((p, i) => ({ name: `Item ${i}`, quantity: "1", unitPrice: p })),
          // A client-sent total is not part of the schema and is ignored.
          ...({ totalCents: 1 } as object),
        }),
      );
      expect(saved.totals).toEqual(expected);
      const result = await submit(me, requestId, saved.version);
      expect(result.totals).toEqual(expected);
      expect(await requestRow(requestId)).toMatchObject({
        requestedSubtotalCents: expected.subtotal,
        requestedTaxCents: expected.tax,
        requestedTotalCents: expected.total,
      });
    }
  });

  it("AC-106 refuses a stale draft save with the conflict error", async () => {
    const { me, requestId, version } = await readyDraft();
    await run((tx) => saveDraft(tx, me, { id: requestId, version, ...MIXER, title: "New" }));
    await expect(
      run((tx) => saveDraft(tx, me, { id: requestId, version, ...MIXER, title: "Old" })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("deletes a draft that was never submitted, and only that", async () => {
    const { me, requestId, version } = await readyDraft();
    const outsider = await fresh((await readyDraft()).me);
    await expect(
      run((tx) => deleteDraft(tx, outsider, { id: requestId, version })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await run((tx) => deleteDraft(tx, me, { id: requestId, version }));
    expect(await requestRow(requestId)).toBeUndefined();
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.eventType, "annual.draft_deleted"), eq(auditEvents.entityId, requestId)),
      );
    expect(event.details).toMatchObject({ before: { title: "Sound desk upgrade" } });

    const submitted = await readyDraft();
    await submit(submitted.me, submitted.requestId, submitted.version);
    await expect(
      run((tx) =>
        deleteDraft(tx, submitted.me, { id: submitted.requestId, version: submitted.version + 1 }),
      ),
    ).rejects.toBeInstanceOf(RuleError);
  });
});

describe("submitting (FR-10, FR-11)", () => {
  it("AC-23 needs a title, a justification, at least one item, item names and a note on $0 items", async () => {
    const { me, requestId, version } = await readyDraft({
      title: "",
      justification: "",
      lines: [],
    });
    await expect(submit(me, requestId, version)).rejects.toMatchObject({
      fieldErrors: {
        title: expect.any(String),
        justification: expect.any(String),
        lines: expect.any(String),
      },
    });
    const saved = await run((tx) =>
      saveDraft(tx, me, {
        id: requestId,
        version,
        ...MIXER,
        lines: [
          { name: "", unitPrice: "5" },
          { name: "Donated stand", unitPrice: "0" },
        ],
      }),
    );
    await expect(submit(me, requestId, saved.version)).rejects.toMatchObject({
      fieldErrors: { "lines.0.name": expect.any(String), "lines.1.notes": expect.any(String) },
    });
  });

  it("AC-37 AC-38 gives one reference, and a repeated click returns the same result", async () => {
    const { me, requestId, version } = await readyDraft();
    const key = randomUUID();
    const first = await submit(me, requestId, version, key);
    expect(first.referenceNumber).toMatch(/^IFC-2027-\d{4}$/);
    expect(first).toMatchObject({ rate: "0.1200", editsRemaining: 2 });

    const again = await submit(me, requestId, version, key);
    expect(again).toEqual(first);
    await expect(submit(me, requestId, version + 1)).rejects.toBeInstanceOf(RuleError);

    const revisions = await db
      .select()
      .from(requestRevisions)
      .where(eq(requestRevisions.budgetRequestId, requestId));
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      revisionNumber: 1,
      kind: "submission",
      totalCents: 114_800,
    });
    const submittedEvents = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "annual.submitted"),
          eq(auditEvents.budgetRequestId, requestId),
        ),
      );
    expect(submittedEvents).toHaveLength(1);
    expect(await requestRow(requestId)).toMatchObject({
      status: "submitted",
      referenceNumber: first.referenceNumber,
      submittedAt: NOW,
    });
  });

  it("refuses an idempotency key from someone else", async () => {
    const a = await readyDraft();
    const b = await readyDraft();
    const key = randomUUID();
    await submit(a.me, a.requestId, a.version, key);
    await expect(submit(b.me, b.requestId, b.version, key)).rejects.toBeInstanceOf(ValidationError);
  });

  it("AC-136 AC-137 respects the deadline and a department's own extension", async () => {
    const late = new Date("2026-12-05T17:00:00Z");
    const a = await readyDraft();
    await expect(
      run((tx) =>
        submitRequest(
          tx,
          a.me,
          { id: a.requestId, version: a.version, idempotencyKey: randomUUID() },
          { now: late },
        ),
      ),
    ).rejects.toThrow(/deadline/);

    const b = await readyDraft();
    await db.insert(deadlineExtensions).values({
      cycleId,
      departmentId: b.dept.id,
      newDeadline: new Date("2026-12-10T06:00:00Z"),
      reason: "Pastor away",
      grantedByUserId: admin.id,
    });
    await run((tx) =>
      submitRequest(
        tx,
        b.me,
        { id: b.requestId, version: b.version, idempotencyKey: randomUUID() },
        { now: late },
      ),
    );
    expect((await requestRow(b.requestId)).status).toBe("submitted");
  });

  it("AC-34 keeps the submitted rate when the administrator changes it", async () => {
    const { me, requestId, version } = await readyDraft();
    await submit(me, requestId, version);
    await db
      .insert(appSettings)
      .values({ key: "sales_tax_rate", value: "0.1300" })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: "0.1300" } });
    try {
      const view = await getRequestView(db, me, requestId);
      expect(view).toMatchObject({ rate: "0.1200", totals: { tax: 12_300 } });
      const revised = await run((tx) =>
        reviseRequest(tx, me, {
          id: requestId,
          version: version + 1,
          idempotencyKey: randomUUID(),
          ...MIXER,
          lines: [{ name: "Mixer", quantity: "2", unitPrice: "1,025.00" }],
        }),
      );
      expect(revised).toMatchObject({ rate: "0.1200", totals: { tax: 24_600 } });
    } finally {
      await db
        .update(appSettings)
        .set({ value: "0.1200" })
        .where(eq(appSettings.key, "sales_tax_rate"));
    }
  });
});

describe("edits after submission (FR-12, FR-17, FR-32)", () => {
  const change = (title: string): RequestContentInput => ({ ...MIXER, title });

  it("AC-41 AC-43 AC-45 AC-60 two edits shared by every representative, then no more", async () => {
    const { me, dept, requestId, version } = await readyDraft();
    await submit(me, requestId, version);
    const second = await newLeader();
    await run((tx) => startRequest(tx, second, { cycleId, departmentId: dept.id }));
    const other = await fresh(second);

    const r1 = await run((tx) =>
      reviseRequest(tx, me, {
        id: requestId,
        version: version + 1,
        idempotencyKey: randomUUID(),
        ...change("Edit one"),
      }),
    );
    expect(r1).toMatchObject({ editsRemaining: 1, usedEdit: true, versionNumber: 2 });
    const r2 = await run((tx) =>
      reviseRequest(tx, other, {
        id: requestId,
        version: version + 2,
        idempotencyKey: randomUUID(),
        ...change("Edit two"),
      }),
    );
    expect(r2).toMatchObject({ editsRemaining: 0, versionNumber: 3 });
    await expect(
      run((tx) =>
        reviseRequest(tx, me, {
          id: requestId,
          version: version + 3,
          idempotencyKey: randomUUID(),
          ...change("Edit three"),
        }),
      ),
    ).rejects.toThrow(/both of its edits/);

    const revisions = await db
      .select()
      .from(requestRevisions)
      .where(eq(requestRevisions.budgetRequestId, requestId));
    expect(revisions.map((r) => [r.revisionNumber, r.kind, r.editedByUserId])).toEqual([
      [1, "submission", me.id],
      [2, "revision", me.id],
      [3, "revision", other.id],
    ]);
    expect(revisions[0].requestSnapshot).toMatchObject({ title: "Sound desk upgrade" });
    expect(await requestRow(requestId)).toMatchObject({ status: "updated", editCount: 2 });
  });

  it("uses no edit when nothing changed", async () => {
    const { me, requestId, version } = await readyDraft();
    await submit(me, requestId, version);
    await expect(
      run((tx) =>
        reviseRequest(tx, me, {
          id: requestId,
          version: version + 1,
          idempotencyKey: randomUUID(),
          ...MIXER,
        }),
      ),
    ).rejects.toThrow(/Nothing has changed/);
    expect((await requestRow(requestId)).editCount).toBe(0);
  });

  it("AC-42 answering a clarification uses no edit", async () => {
    const { me, requestId, version } = await readyDraft();
    await submit(me, requestId, version);
    // The accountant's return arrives in step 6; set the status the way it will.
    await db
      .update(budgetRequests)
      .set({ status: "returned", version: version + 2 })
      .where(eq(budgetRequests.id, requestId));
    const result = await run((tx) =>
      reviseRequest(tx, me, {
        id: requestId,
        version: version + 2,
        idempotencyKey: randomUUID(),
        ...change("Answered"),
      }),
    );
    expect(result).toMatchObject({ usedEdit: false, editsRemaining: 2 });
    expect(await requestRow(requestId)).toMatchObject({ status: "updated", editCount: 0 });
    const [revision] = await db
      .select()
      .from(requestRevisions)
      .where(
        and(
          eq(requestRevisions.budgetRequestId, requestId),
          eq(requestRevisions.revisionNumber, 2),
        ),
      );
    expect(revision.kind).toBe("clarification_response");
  });

  it("AC-46 refuses edits after a decision", async () => {
    const { me, requestId, version } = await readyDraft();
    await submit(me, requestId, version);
    await db
      .update(budgetRequests)
      .set({
        status: "approved",
        approvedSubtotalCents: 102_500,
        approvedTaxCents: 12_300,
        approvedTotalCents: 114_800,
        version: version + 2,
      })
      .where(eq(budgetRequests.id, requestId));
    await expect(
      run((tx) =>
        reviseRequest(tx, me, {
          id: requestId,
          version: version + 2,
          idempotencyKey: randomUUID(),
          ...change("Too late"),
        }),
      ),
    ).rejects.toBeInstanceOf(RuleError);
  });
});

describe("what people can see", () => {
  it("AC-3 another department can't open the request; the System Administrator reads it", async () => {
    const { requestId } = await readyDraft();
    const outsider = await fresh((await readyDraft()).me);
    expect(await getRequestView(db, outsider, requestId)).toBeNull();
    expect(await getRequestView(db, admin, requestId)).toMatchObject({ readOnly: true });
  });

  it("AC-48 lists drafts for the department and shows them in My tasks, without counting them as submitted", async () => {
    const { me, requestId } = await readyDraft();
    expect(await listMyRequests(db, me)).toEqual([
      expect.objectContaining({ id: requestId, status: "draft", totalCents: null }),
    ]);
    const tasks = await annualRequesterTasks(db, me as Viewer);
    expect(tasks).toEqual([
      expect.objectContaining({
        id: `annual:${requestId}:submit`,
        href: `/annual/${requestId}/edit`,
      }),
    ]);
    const [link] = await db.select().from(userDepartments).where(eq(userDepartments.userId, me.id));
    expect(link.source).toBe("form_pick");
  });
});
