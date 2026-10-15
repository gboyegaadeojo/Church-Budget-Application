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
    googleSubject: "google-gina",
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
    roles: ["accountant"],
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

  for (const p of PEOPLE) {
    const { rows } = await client.query(
      `insert into users (email, display_name, google_subject_id, pco_person_id,
         pco_leader_verified, pco_verified_at, access_status)
       values ($1, $2, $3, $4, $5, case when $5 then now() end, 'active')
       returning id`,
      [p.email, p.name, p.googleSubject ?? null, p.pcoPersonId ?? null, p.leader],
    );
    const userId = rows[0].id;
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
}
