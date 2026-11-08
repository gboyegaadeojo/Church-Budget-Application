/**
 * Sample data for looking around the local app (`npm run dev:fake -- --showcase`): budgets
 * for several departments, purchase requests and claims at every step, payments, and
 * next year's budget requests. Everything after the people and FY2026 budgets goes
 * through the app's own services, so totals, budgets and spending all agree.
 *
 * Only for the in-memory fake database. Never run against a real one.
 *
 *   npx tsx scripts/showcase-data.ts postgres://postgres:postgres@127.0.0.1:54329/postgres
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { decideRequest, startReview } from "@/domain/annual/review";
import { saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { boardDecide } from "@/domain/expenses/board";
import { startProcessing, recordPayment } from "@/domain/expenses/payment";
import { accountantDecide } from "@/domain/expenses/review";
import type { ExpenseContentInput } from "@/domain/expenses/schema";
import {
  loadExpense,
  saveExpenseDraft,
  startExpense,
  submitExpense,
} from "@/domain/expenses/service";
import { loadViewer } from "@/domain/users/viewer";
import type { Subject } from "@/lib/authz";

const url = process.argv[2];
if (!url || !/127\.0\.0\.1|localhost/.test(url)) {
  console.error("Give the local fake database URL. This script never runs against a real one.");
  process.exit(1);
}
const pool = new Pool({ connectionString: url, max: 2 });
const db = drizzle(pool, { schema }) as unknown as Db;
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const sql = (text: string, values: unknown[] = []) => pool.query(text, values);

// ---------------------------------------------------------------- people and budgets

/** Leaders for other departments, so the accountant and board see a whole church. */
const LEADERS: [string, string, string][] = [
  ["grace.okafor@example.org", "Grace Okafor", "Choir Team"],
  ["daniel.mensah@example.org", "Daniel Mensah", "Drama Team"],
  ["ruth.adeyemi@example.org", "Ruth Adeyemi", "Children Sunday School"],
  ["peter.obi@example.org", "Peter Obi", "Ushering Team"],
  ["esther.bello@example.org", "Esther Bello", "Women's Fellowship Team"],
  ["tobi.ajayi@example.org", "Tobi Ajayi", "Social Media Team"],
  ["joy.eze@example.org", "Joy Eze", "Prayer Warrior Team"],
];

/** FY2026 budgets, including tax, approved and released like Media Team's. */
const BUDGETS: [string, number][] = [
  ["Choir Team", 800_000],
  ["Drama Team", 550_000],
  ["Children Sunday School", 600_000],
  ["Ushering Team", 250_000],
  ["Women's Fellowship Team", 700_000],
  ["Social Media Team", 400_000],
  ["Prayer Warrior Team", 150_000],
];

async function idOf(table: string, column: string, value: string): Promise<string> {
  const { rows } = await sql(`select id from ${table} where ${column} = $1`, [value]);
  if (!rows[0]) throw new Error(`No ${table} row for ${value}`);
  return rows[0].id;
}

async function viewer(email: string): Promise<Subject> {
  const result = await loadViewer(db, await idOf("users", "email", email));
  if (!result.ok) throw new Error(`${email} can't act: ${result.reason}`);
  return result.viewer;
}

async function addPeopleAndBudgets() {
  for (const [email, name, department] of LEADERS) {
    const { rows } = await sql(
      `insert into users (email, display_name, pco_leader_verified, pco_verified_at, access_status)
       values ($1, $2, true, now(), 'active') returning id`,
      [email, name],
    );
    await sql("insert into user_roles (user_id, role) values ($1, 'requester')", [rows[0].id]);
    await sql(
      `insert into user_departments (user_id, department_id, representative_type)
       select $1, id, 'primary' from departments where name = $2`,
      [rows[0].id, department],
    );
  }

  const fy2026 = await idOf("budget_cycles", "name", "FY2026");
  const gina = await idOf("users", "email", "gina.admin@example.org");
  const pat = await idOf("users", "email", "pat.accountant@example.org");
  let reference = 2;
  for (const [department, total] of BUDGETS) {
    // Inclusive of 12%: subtotal rounded half-up, tax the rest (money.ts splitInclusive).
    const subtotal = Math.round((total * 100) / 112);
    const tax = total - subtotal;
    const { rows: request } = await sql(
      `insert into budget_requests (budget_cycle_id, department_id, requester_user_id,
         department_name_snapshot, title, justification, status, reference_number, tax_rate,
         requested_subtotal_cents, requested_tax_cents, requested_total_cents,
         approved_subtotal_cents, approved_tax_cents, approved_total_cents,
         submitted_at, approved_at, version_number)
       select $1, d.id, $2, d.name, d.name || ' 2026', 'Our ministry for the year.', 'approved',
         $3, '0.1200', $4, $5, $6, $4, $5, $6, '2025-11-01T17:00:00Z',
         '2025-12-01T17:00:00Z', 1
       from departments d where d.name = $7 returning id`,
      [
        fy2026,
        gina,
        `IFC-2026-${String(reference++).padStart(4, "0")}`,
        subtotal,
        tax,
        total,
        department,
      ],
    );
    await sql(
      `insert into budget_line_items (budget_request_id, item_name, quantity, unit_price_cents,
         line_total_cents, sort_order)
       values ($1, 'Ministry supplies', 1, $2, $2, 0)`,
      [request[0].id, subtotal],
    );
    const { rows: revision } = await sql(
      `insert into request_revisions (budget_request_id, revision_number, kind, edited_by_user_id,
         tax_rate, subtotal_cents, tax_cents, total_cents, request_snapshot)
       values ($1, 1, 'submission', $2, '0.1200', $3, $4, $5, '{}') returning id`,
      [request[0].id, gina, subtotal, tax, total],
    );
    await sql(
      `insert into approval_decisions (budget_request_id, request_revision_id, decision, method,
         approved_subtotal_cents, approved_tax_cents, approved_total_cents, approver_user_id,
         acting_role, released_at)
       values ($1, $2, 'approved', 'as_requested', $3, $4, $5, $6, 'accountant',
         '2025-12-01T17:00:00Z')`,
      [request[0].id, revision[0].id, subtotal, tax, total, pat],
    );
  }

  // Two people who can sign church cheques (FR-53), so cheque payments can be recorded.
  for (const name of ["Pastor James Ade", "Deacon Mary Cole"]) {
    await sql(
      `insert into signing_authorities (name, active_from, created_by_user_id)
       values ($1, '2026-01-01', $2)`,
      [name, gina],
    );
  }
}

// ---------------------------------------------------------------- expenses (FY2026)

type Step = "draft" | "submitted" | "accountant" | "approved" | "processing" | "paid";
type Decision =
  { kind: "approve" } | { kind: "return"; note: string } | { kind: "decline"; note: string };

const purchase = (
  title: string,
  justification: string,
  items: [string, string, string][],
  extra: Partial<ExpenseContentInput> = {},
): ExpenseContentInput => ({
  title,
  justification,
  items: items.map(([name, quantity, unitPrice]) => ({ name, quantity, unitPrice })),
  howBought: "church_account",
  ...extra,
});

const claim = (
  title: string,
  justification: string,
  lines: [string, string, string, string][],
  extra: Partial<ExpenseContentInput> = {},
): ExpenseContentInput => ({
  title,
  justification,
  lines: lines.map(([date, vendor, description, amount]) => ({
    date,
    vendor,
    description,
    amount,
  })),
  payeeKind: "self",
  noReceipt: true,
  noReceiptReason: "Paper receipt handed to the office.",
  ...extra,
});

async function expense(
  who: string,
  department: string,
  type: "purchase_request" | "expense_claim",
  content: ExpenseContentInput,
  to: Step,
  options: { accountant?: Decision; payWith?: "cheque" | "church_card" } = {},
) {
  const actor = await viewer(who);
  const cycleId = await idOf("budget_cycles", "name", "FY2026");
  const departmentId = await idOf("departments", "name", department);
  const { expenseId: id } = await run((tx) =>
    startExpense(tx, actor, { type, departmentId, cycleId }),
  );
  // Read inside the transaction: the in-memory database serves one connection at a time.
  const version = (tx: Tx) => loadExpense(tx, id).then((r) => r.version);
  await run(async (tx) =>
    saveExpenseDraft(tx, actor, { id, version: await version(tx), ...content }),
  );
  if (to === "draft") return id;
  await run(async (tx) =>
    submitExpense(tx, actor, { id, version: await version(tx), idempotencyKey: randomUUID() }),
  );
  if (to === "submitted") return id;

  const pat = await viewer("pat.accountant@example.org");
  await run(async (tx) =>
    accountantDecide(tx, pat, {
      id,
      version: await version(tx),
      idempotencyKey: randomUUID(),
      decision: options.accountant ?? { kind: "approve" },
    }),
  );
  if (to === "accountant") return id;

  const cleo = await viewer("cleo.chair@example.org");
  await run(async (tx) =>
    boardDecide(tx, cleo, {
      id,
      version: await version(tx),
      idempotencyKey: randomUUID(),
      decision: { kind: "approve" },
    }),
  );
  if (to === "approved") return id;

  const carol = await viewer("carol.office@outlook.com");
  await run(async (tx) =>
    startProcessing(tx, carol, { id, version: await version(tx), idempotencyKey: randomUUID() }),
  );
  if (to === "processing") return id;

  const row = await loadExpense(db, id);
  const amount = (row.approvedTotalCents! / 100).toFixed(2);
  const { rows: signers } = await sql("select id from signing_authorities order by name");
  const payment =
    options.payWith === "church_card"
      ? {
          method: "church_card",
          paidOn: "2026-11-03",
          amount,
          cardLast4: "4821",
          reference: `TX${Math.floor(Math.random() * 90000 + 10000)}`,
          purchasedBy: "Carol Office",
        }
      : {
          method: "cheque",
          paidOn: "2026-11-03",
          amount,
          reference: String(1040 + Math.floor(Math.random() * 60)),
          chequeSigner1Id: signers[0].id,
          chequeSigner2Id: signers[1].id,
        };
  await run((tx) =>
    recordPayment(tx, carol, { id, version: row.version, idempotencyKey: randomUUID(), payment }),
  );
  return id;
}

async function addExpenses() {
  const sam = "sam.lee@example.org";
  const gina = "gina.admin@example.org";

  // Media Team: something at every step, for Sam, Pat, Cleo and Carol to see.
  await expense(
    sam,
    "Media Team",
    "purchase_request",
    purchase("Wireless microphones", "Two of our handheld microphones failed on Sunday.", [
      ["Shure SM58 microphone", "2", "129.99"],
      ["XLR cable, 25 ft", "4", "24.50"],
    ]),
    "paid",
    { payWith: "church_card" },
  );
  await expense(
    sam,
    "Media Team",
    "expense_claim",
    claim("Cables and tape", "Bought for the youth conference set-up.", [
      ["2026-10-01", "Long & McQuade", "XLR cables", "112.00"],
      ["2026-10-02", "Staples", "Gaffer tape", "56.00"],
    ]),
    "paid",
  );
  await expense(
    sam,
    "Media Team",
    "expense_claim",
    claim("Batteries for microphones", "Monthly batteries for the wireless microphones.", [
      ["2026-10-20", "Costco", "AA batteries, 48 pack", "38.40"],
    ]),
    "approved",
  );
  await expense(
    gina,
    "Media Team",
    "purchase_request",
    purchase("Livestream cameras", "Our cameras are failing during services.", [
      ["Blackmagic PYXIS 6K", "3", "2656.25"],
    ]),
    "accountant",
  );
  await expense(
    sam,
    "Media Team",
    "purchase_request",
    purchase(
      "Guest speaker honorarium",
      "Honorarium for the November guest speaker.",
      [["Honorarium", "1", "500.00"]],
      { addsSalesTax: false },
    ),
    "submitted",
  );
  await expense(
    sam,
    "Media Team",
    "expense_claim",
    claim("Projector cleaning kit", "Kit to clean the sanctuary projector.", [
      ["2026-10-28", "Best Buy", "Cleaning kit", "45.99"],
    ]),
    "accountant",
    {
      accountant: {
        kind: "return",
        note: "Is this the kit we already have in the media room? Please check before we approve.",
      },
    },
  );
  await expense(
    sam,
    "Media Team",
    "purchase_request",
    purchase("Projector bulb", "The spare bulb is getting old.", [
      ["Projector bulb", "1", "350.00"],
    ]),
    "accountant",
    {
      accountant: {
        kind: "decline",
        note: "We replaced the bulb in September; it still has plenty of hours left.",
      },
    },
  );
  await expense(
    sam,
    "Media Team",
    "purchase_request",
    purchase("Stage lighting", "Two LED par lights for the stage.", [
      ["LED par light", "2", "189.00"],
    ]),
    "draft",
  );

  // Other departments, for the accountant's and board's dashboards.
  await expense(
    "grace.okafor@example.org",
    "Choir Team",
    "expense_claim",
    claim("Choir robes cleaning", "Dry cleaning before the Christmas concert.", [
      ["2026-10-15", "Prestige Cleaners", "18 robes", "240.00"],
    ]),
    "paid",
  );
  await expense(
    "grace.okafor@example.org",
    "Choir Team",
    "purchase_request",
    purchase("Sheet music", "Music for the Christmas concert.", [["Choral score", "30", "6.00"]]),
    "submitted",
  );
  await expense(
    "daniel.mensah@example.org",
    "Drama Team",
    "purchase_request",
    purchase("Christmas play costumes", "Costumes for the nativity play.", [
      ["Costume set", "8", "135.00"],
    ]),
    "approved",
  );
  await expense(
    "ruth.adeyemi@example.org",
    "Children Sunday School",
    "expense_claim",
    claim("Craft supplies", "Paper, glue and paint for Sunday crafts.", [
      ["2026-10-12", "Michaels", "Craft supplies", "86.50"],
    ]),
    "paid",
  );
  await expense(
    "ruth.adeyemi@example.org",
    "Children Sunday School",
    "purchase_request",
    purchase("Children's Bibles", "Bibles for the new class.", [
      ["Children's Bible", "30", "12.00"],
    ]),
    "processing",
  );
  await expense(
    "peter.obi@example.org",
    "Ushering Team",
    "purchase_request",
    purchase("Usher vests", "Matching vests so visitors can find an usher.", [
      ["Usher vest", "20", "100.00"],
    ]),
    "paid",
    { payWith: "church_card" },
  );
  await expense(
    "esther.bello@example.org",
    "Women's Fellowship Team",
    "purchase_request",
    purchase(
      "Retreat venue deposit",
      "Deposit for the spring women's retreat.",
      [["Venue deposit", "1", "3000.00"]],
      { addsSalesTax: false },
    ),
    "accountant",
  );
  await expense(
    "tobi.ajayi@example.org",
    "Social Media Team",
    "expense_claim",
    claim("Canva subscription", "Annual design subscription for church graphics.", [
      ["2026-10-05", "Canva", "Canva Pro, 1 year", "179.99"],
    ]),
    "paid",
  );
  await expense(
    "joy.eze@example.org",
    "Prayer Warrior Team",
    "expense_claim",
    claim(
      "Prayer night refreshments",
      "Snacks and drinks for the all-night prayer.",
      [["2026-10-30", "Walmart", "Snacks and drinks", "64.75"]],
      { payeeKind: "other", payeeName: "Ada Volunteer" },
    ),
    "submitted",
  );
}

// ---------------------------------------------------------------- next year's budgets (FY2027)

async function annual(
  who: string,
  department: string,
  title: string,
  lines: [string, string, string][],
  to: "draft" | "submitted" | "in_review" | "returned" | "approved",
) {
  const actor = await viewer(who);
  const cycleId = await idOf("budget_cycles", "name", "FY2027");
  const departmentId = await idOf("departments", "name", department);
  const { requestId: id } = await run((tx) => startRequest(tx, actor, { cycleId, departmentId }));
  const version = (tx: Tx) =>
    tx
      .select({ version: schema.budgetRequests.version })
      .from(schema.budgetRequests)
      .where(eq(schema.budgetRequests.id, id))
      .then((r) => r[0].version);
  const me = await viewer(who);
  await run(async (tx) =>
    saveDraft(tx, me, {
      id,
      version: await version(tx),
      title,
      justification: `What ${department} needs for 2027.`,
      lines: lines.map(([name, quantity, unitPrice]) => ({ name, quantity, unitPrice })),
    }),
  );
  if (to === "draft") return;
  await run(async (tx) =>
    submitRequest(tx, me, { id, version: await version(tx), idempotencyKey: randomUUID() }),
  );
  if (to === "submitted") return;
  const pat = await viewer("pat.accountant@example.org");
  await run((tx) => startReview(tx, pat, { id }));
  if (to === "in_review") return;
  await run(async (tx) =>
    decideRequest(tx, pat, {
      id,
      version: await version(tx),
      idempotencyKey: randomUUID(),
      decision:
        to === "returned"
          ? { kind: "return", note: "Could you split the equipment line into separate items?" }
          : { kind: "approve_as_requested" },
    }),
  );
}

async function addAnnualRequests() {
  await annual(
    "grace.okafor@example.org",
    "Choir Team",
    "Choir 2027",
    [
      ["Robes", "10", "85.00"],
      ["Sheet music", "1", "1200.00"],
      ["Concert hall rental", "1", "2500.00"],
    ],
    "submitted",
  );
  await annual(
    "daniel.mensah@example.org",
    "Drama Team",
    "Drama 2027",
    [
      ["Costumes", "1", "1500.00"],
      ["Props and set", "1", "900.00"],
    ],
    "submitted",
  );
  await annual(
    "ruth.adeyemi@example.org",
    "Children Sunday School",
    "Children 2027",
    [
      ["Curriculum", "4", "350.00"],
      ["Craft supplies", "12", "75.00"],
    ],
    "in_review",
  );
  await annual(
    "peter.obi@example.org",
    "Ushering Team",
    "Ushering 2027",
    [["Equipment", "1", "1800.00"]],
    "returned",
  );
  await annual(
    "esther.bello@example.org",
    "Women's Fellowship Team",
    "Women's Fellowship 2027",
    [
      ["Spring retreat", "1", "5000.00"],
      ["Monthly meetings", "12", "120.00"],
    ],
    "approved",
  );
  await annual(
    "tobi.ajayi@example.org",
    "Social Media Team",
    "Social Media 2027",
    [["Design software", "1", "180.00"]],
    "draft",
  );
}

async function main() {
  try {
    await addPeopleAndBudgets();
    await addExpenses();
    await addAnnualRequests();
    console.log("Sample data added: 8 departments with budgets, 18 expenses, 6 FY2027 requests.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
