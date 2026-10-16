/**
 * Test and local-development data: the church's 18 starting departments (FR-03) and the
 * people in tests/fixtures/fake-identities.json. Never run against a real database.
 */

export const DEPARTMENTS = [
  "Adult Sunday School",
  "Children Sunday School",
  "Choir Team",
  "Decoration Team",
  "Drama Team",
  "Evangelism Team",
  "Media Team",
  "Men's Fellowship",
  "Prayer Warrior Team",
  "Prime Adult/Young Adult Ministry",
  "Quality Control Team",
  "Sanctuary Keepers Team",
  "Social Media Team",
  "Transportation Team",
  "Ushering Team",
  "Visitation Team",
  "Women's Fellowship Team",
  "Young Couples Ministry",
];

const ALL_ROLES = [
  "requester",
  "accountant",
  "backup_approver",
  "board_chair",
  "vice_chair",
  "church_admin",
  "system_admin",
];

/** People with accounts already (fake-identities.json); Ada and the others start without one. */
const PEOPLE = [
  {
    email: "gina.admin@example.org",
    name: "Gina Admin",
    pcoPersonId: "1000",
    roles: ALL_ROLES,
    departments: [["Media Team", "primary"]],
    leader: true,
  },
  {
    email: "sam.lee@example.org",
    name: "Sam Lee",
    pcoPersonId: "1001",
    roles: ["requester"],
    departments: [["Media Team", "backup"]],
    leader: true,
  },
  {
    email: "kim.former@example.org",
    name: "Kim Former",
    pcoPersonId: "1004",
    roles: ["requester"],
    departments: [["Youth Ministry", "primary"]],
    leader: true,
  },
  {
    email: "pat.accountant@example.org",
    name: "Pat Accountant",
    // Linked by an administrator, so Planning Center sign-in reaches this account.
    pcoPersonId: "1006",
    roles: ["accountant"],
    departments: [],
    leader: false,
  },
  {
    // Added by an administrator but not linked yet: Planning Center sign-in asks for a link.
    email: "bo.chair@example.org",
    name: "Bo Chair",
    roles: ["board_chair"],
    departments: [],
    leader: false,
  },
  {
    // Not in Planning Center: signs in with an emailed code (FR-01b).
    email: "carol.office@outlook.com",
    name: "Carol Office",
    roles: ["church_admin"],
    departments: [],
    leader: false,
  },
];

/** @param {{ query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> }} client */
export async function seedTestData(client) {
  const names = [...DEPARTMENTS, "Youth Ministry"];
  for (const name of names) {
    await client.query("insert into departments (name) values ($1) on conflict do nothing", [name]);
  }
  await client.query("update app_settings set value = $1 where key = 'admin_contact_email'", [
    "office@example.org",
  ]);

  const ids = {};
  for (const p of PEOPLE) {
    const { rows } = await client.query(
      `insert into users (email, display_name, pco_person_id,
         pco_leader_verified, pco_verified_at, access_status)
       values ($1, $2, $3, $4, case when $4 then now() end, 'active')
       returning id`,
      [p.email, p.name, p.pcoPersonId ?? null, p.leader],
    );
    const userId = rows[0].id;
    ids[p.email] = userId;
    for (const role of p.roles) {
      await client.query("insert into user_roles (user_id, role) values ($1, $2)", [userId, role]);
    }
    for (const [department, type] of p.departments) {
      await client.query(
        `insert into user_departments (user_id, department_id, representative_type, backup_rank)
         select $1, id, $3::text::representative_type, case when $3::text = 'backup' then 1 end
         from departments where name = $2`,
        [userId, department, type],
      );
    }
  }

  // FY2026 is closed, with Media Team's budget approved and released, so expenses
  // (Part B) can be charged to it. Media's FY2027 request is left to the annual form.
  const gina = ids["gina.admin@example.org"];
  const pat = ids["pat.accountant@example.org"];
  const { rows: fy2026 } = await client.query(
    `insert into budget_cycles (name, budget_year, start_date, submission_deadline, status,
       default_tax_rate, created_by_user_id)
     values ('FY2026', 2026, '2026-01-01', '2025-11-30T08:00:00Z', 'closed', '0.1200', $1)
     returning id`,
    [gina],
  );
  // $30,000.00 including tax: $26,785.71 + $3,214.29 (CLAUDE.md test values).
  const { rows: media } = await client.query(
    `insert into budget_requests (budget_cycle_id, department_id, requester_user_id,
       department_name_snapshot, title, justification, status, reference_number, tax_rate,
       requested_subtotal_cents, requested_tax_cents, requested_total_cents,
       approved_subtotal_cents, approved_tax_cents, approved_total_cents,
       submitted_at, approved_at, version_number)
     select $1, d.id, $2, d.name, 'Media ministry 2026', 'Sound, video and streaming.',
       'approved', 'IFC-2026-0001', '0.1200', 2678571, 321429, 3000000, 2678571, 321429,
       3000000, '2025-11-01T17:00:00Z', '2025-12-01T17:00:00Z', 1
     from departments d where d.name = 'Media Team'
     returning id`,
    [fy2026[0].id, gina],
  );
  await client.query(
    `insert into budget_line_items (budget_request_id, item_name, quantity, unit_price_cents,
       line_total_cents, sort_order)
     values ($1, 'Microphones and cables', 1, 1500000, 1500000, 0),
            ($1, 'Streaming equipment', 1, 1178571, 1178571, 1)`,
    [media[0].id],
  );
  const { rows: revision } = await client.query(
    `insert into request_revisions (budget_request_id, revision_number, kind, edited_by_user_id,
       tax_rate, subtotal_cents, tax_cents, total_cents, request_snapshot)
     values ($1, 1, 'submission', $2, '0.1200', 2678571, 321429, 3000000, '{}')
     returning id`,
    [media[0].id, gina],
  );
  await client.query(
    `insert into approval_decisions (budget_request_id, request_revision_id, decision, method,
       approved_subtotal_cents, approved_tax_cents, approved_total_cents, approver_user_id,
       acting_role, released_at)
     values ($1, $2, 'approved', 'as_requested', 2678571, 321429, 3000000, $3, 'accountant',
       '2025-12-01T17:00:00Z')`,
    [media[0].id, revision[0].id, pat],
  );

  // FY2027 is open, with its deadline 60 days out, so the annual form can be used (FR-03).
  await client.query(
    `insert into budget_cycles (name, budget_year, start_date, submission_deadline, status,
       default_tax_rate, created_by_user_id)
     values ('FY2027', 2027, '2027-01-01', now() + interval '60 days', 'open', '0.1200', $1)`,
    [ids["gina.admin@example.org"]],
  );
}
