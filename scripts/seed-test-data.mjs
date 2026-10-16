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

  // FY2027 is open, with its deadline 60 days out, so the annual form can be used (FR-03).
  await client.query(
    `insert into budget_cycles (name, budget_year, start_date, submission_deadline, status,
       default_tax_rate, created_by_user_id)
     values ('FY2027', 2027, '2027-01-01', now() + interval '60 days', 'open', '0.1200', $1)`,
    [ids["gina.admin@example.org"]],
  );
}
