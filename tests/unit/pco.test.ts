import { describe, expect, it, vi } from "vitest";
import { checkLeader, parseYesNo, valueMatches } from "@/domain/users/leader-check";
import {
  FakePlanningCenterDirectory,
  HttpPlanningCenterDirectory,
  PlanningCenterUnavailableError,
} from "@/lib/pco";

describe("Yes/No values (Ministry Leader = Yes)", () => {
  it.each(["Yes", "yes", "YES", " yes ", "true", "TRUE", "t", "y", "1", "checked", "on"])(
    "%j means yes",
    (value) => expect(parseYesNo(value)).toBe(true),
  );

  it.each(["No", "no", "false", "f", "n", "0", "", "unchecked", "off"])("%j means no", (value) =>
    expect(parseYesNo(value)).toBe(false),
  );

  it.each(["maybe", "Group Leader", "2"])("%j is neither", (value) =>
    expect(parseYesNo(value)).toBeNull(),
  );

  it("matches an accepted Yes however Planning Center stores it", () => {
    for (const stored of ["Yes", "yes", "true", "True", "1"]) {
      expect(valueMatches(stored, ["Yes"], "boolean")).toBe(true);
    }
    for (const stored of ["No", "false", "0", "", "Group Leader"]) {
      expect(valueMatches(stored, ["Yes"], "boolean")).toBe(false);
    }
  });

  it("can accept No if the administrator ever wants that", () => {
    expect(valueMatches("false", ["No"], "boolean")).toBe(true);
    expect(valueMatches("true", ["No"], "boolean")).toBe(false);
  });

  it("compares other field types as text, ignoring case and spaces", () => {
    expect(valueMatches("Group Leader", ["group leader"], "string")).toBe(true);
    expect(valueMatches(" Group Leader ", ["Group Leader"], "checkboxes")).toBe(true);
    expect(valueMatches("true", ["Yes"], "string")).toBe(false);
    expect(valueMatches("", [""], "string")).toBe(false);
  });
});

/** Answers People API paths with canned JSON:API bodies, as Planning Center returns them. */
function fakeFetch(routes: Record<string, unknown | number>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const key = decodeURIComponent(url.pathname + url.search);
    const route = routes[key];
    if (route === undefined) return new Response("{}", { status: 404 });
    if (typeof route === "number") return new Response("{}", { status: route });
    return Response.json(route);
  });
}

const PERSON_42 = {
  data: {
    type: "Person",
    id: "42",
    attributes: { name: "Sam Lee", status: "active" },
    relationships: {
      emails: { data: [{ type: "Email", id: "9" }] },
      phone_numbers: {
        data: [
          { type: "PhoneNumber", id: "5" },
          { type: "PhoneNumber", id: "6" },
        ],
      },
    },
  },
  included: [
    { type: "Email", id: "9", attributes: { address: "Sam@Example.org", primary: true } },
    {
      type: "PhoneNumber",
      id: "5",
      attributes: { number: "(204) 555-0100", location: "Home", primary: true },
    },
    {
      type: "PhoneNumber",
      id: "6",
      attributes: { e164: "+12045550199", location: "Mobile", primary: false },
    },
    // Someone else's number in the same answer is never picked.
    { type: "PhoneNumber", id: "7", attributes: { e164: "+12045550777", location: "Mobile" } },
  ],
};

const ROUTES = {
  "/people/v2": { data: { type: "Organization", id: "100", attributes: { name: "IFC" } } },
  "/people/v2/people/42?include=emails,phone_numbers": PERSON_42,
  "/people/v2/emails?where[address]=sam@example.org&per_page=25": {
    data: [
      {
        type: "Email",
        id: "9",
        attributes: { address: "sam@example.org" },
        relationships: { person: { data: { type: "Person", id: "42" } } },
      },
    ],
  },
  "/people/v2/field_definitions?per_page=100": {
    data: [
      {
        type: "FieldDefinition",
        id: "5",
        attributes: { name: "Birthday Club", data_type: "boolean" },
      },
      {
        type: "FieldDefinition",
        id: "7",
        attributes: { name: "Ministry Leader", data_type: "boolean", deleted_at: null },
      },
    ],
  },
  "/people/v2/people/42/field_data?where[field_definition_id]=7&per_page=100": {
    data: [{ type: "FieldDatum", id: "300", attributes: { value: "true" } }],
  },
};

describe("HttpPlanningCenterDirectory", () => {
  const credentials = { appId: "app-id", secret: "pat-secret" };

  it("calls the People API with the token and a User-Agent", async () => {
    const fetchImpl = fakeFetch(ROUTES);
    const dir = new HttpPlanningCenterDirectory(credentials, fetchImpl as typeof fetch);
    await dir.organizationId();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://api.planningcenteronline.com/people/v2");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("app-id:pat-secret").toString("base64")}`,
    );
    expect(headers["User-Agent"]).toMatch(/Church Budget/);
  });

  it("reads the organization, people, emails, field definitions and field data", async () => {
    const dir = new HttpPlanningCenterDirectory(credentials, fakeFetch(ROUTES) as typeof fetch);
    expect(await dir.organizationId()).toBe("100");
    expect(await dir.getPerson("42")).toEqual({
      id: "42",
      name: "Sam Lee",
      status: "active",
      emails: ["sam@example.org"],
      phone: "+12045550199",
    });
    expect(await dir.findPeopleByEmail(" SAM@example.org ")).toHaveLength(1);
    expect(await dir.findFieldDefinition("ministry leader")).toEqual({
      id: "7",
      name: "Ministry Leader",
      dataType: "boolean",
    });
    expect(await dir.getFieldValues("42", "7")).toEqual(["true"]);
  });

  it('checks a Yes/No field end to end: stored "true" passes an accepted "Yes"', async () => {
    const dir = new HttpPlanningCenterDirectory(credentials, fakeFetch(ROUTES) as typeof fetch);
    const result = await checkLeader(
      dir,
      { fieldName: "Ministry Leader", acceptedValues: ["Yes"] },
      { email: "sam@example.org" },
    );
    expect(result).toMatchObject({ status: "leader", fieldValue: "true", person: { id: "42" } });
  });

  it("returns null for an unknown person and rejects non-numeric ids without calling", async () => {
    const fetchImpl = fakeFetch(ROUTES);
    const dir = new HttpPlanningCenterDirectory(credentials, fetchImpl as typeof fetch);
    expect(await dir.getPerson("43")).toBeNull();
    expect(await dir.getPerson("../admin")).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 429, 500, 503])("treats HTTP %i as unavailable", async (status) => {
    const dir = new HttpPlanningCenterDirectory(
      credentials,
      fakeFetch({ "/people/v2": status }) as typeof fetch,
    );
    await expect(dir.organizationId()).rejects.toBeInstanceOf(PlanningCenterUnavailableError);
  });

  it("treats a network failure as unavailable", async () => {
    const dir = new HttpPlanningCenterDirectory(credentials, (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    await expect(dir.getPerson("42")).rejects.toBeInstanceOf(PlanningCenterUnavailableError);
  });

  it("FR-39 lists teams (named with their service type), groups and tags, leaving archived ones out", async () => {
    const dir = new HttpPlanningCenterDirectory(
      credentials,
      fakeFetch({
        "/services/v2/teams?include=service_type&per_page=100": {
          data: [
            {
              type: "Team",
              id: "5",
              attributes: { name: "Media / Production", archived_at: null },
              relationships: { service_type: { data: { type: "ServiceType", id: "1" } } },
            },
            {
              type: "Team",
              id: "9",
              attributes: { name: "Media / Production", archived_at: null },
              relationships: { service_type: { data: { type: "ServiceType", id: "2" } } },
            },
            { type: "Team", id: "6", attributes: { name: "Old", archived_at: "2020-01-01" } },
            { type: "Team", id: "7", attributes: { name: "No type" } },
          ],
          included: [
            { type: "ServiceType", id: "1", attributes: { name: "Sunday Service" } },
            { type: "ServiceType", id: "2", attributes: { name: "Midweek" } },
          ],
        },
        "/groups/v2/groups?per_page=100": {
          data: [{ type: "Group", id: "8", attributes: { name: "Youth Leaders" } }],
        },
        "/groups/v2/tag_groups?include=tags&per_page=100": {
          data: [
            {
              type: "TagGroup",
              id: "1",
              attributes: { name: "Ministry" },
              relationships: { tags: { data: [{ type: "Tag", id: "70" }] } },
            },
          ],
          included: [{ type: "Tag", id: "70", attributes: { name: "Youth" } }],
        },
      }) as typeof fetch,
    );
    expect(await dir.listSources("services_team")).toEqual([
      { id: "5", name: "Sunday Service: Media / Production" },
      { id: "9", name: "Midweek: Media / Production" },
      { id: "7", name: "No type" },
    ]);
    expect(await dir.listSources("groups_group")).toEqual([{ id: "8", name: "Youth Leaders" }]);
    expect(await dir.listSources("groups_tag")).toEqual([{ id: "70", name: "Ministry: Youth" }]);
  });

  it("FR-39 reads team leaders, group leaders and the leaders of a tag's groups", async () => {
    const person = (id: string) => ({ data: { type: "Person", id } });
    const membership = (personId: string) => ({
      type: "Membership",
      id: `m${personId}`,
      attributes: { role: "leader" },
      relationships: { person: person(personId) },
    });
    const dir = new HttpPlanningCenterDirectory(
      credentials,
      fakeFetch({
        "/services/v2/teams/5": { data: { type: "Team", id: "5", attributes: {} } },
        "/services/v2/teams/5/team_leaders?per_page=100": {
          data: [
            { type: "TeamLeader", id: "1", relationships: { people: person("42") } },
            { type: "TeamLeader", id: "2", relationships: { people: person("43") } },
          ],
        },
        "/groups/v2/groups/8": { data: { type: "Group", id: "8", attributes: {} } },
        "/groups/v2/groups/8/memberships?where[role]=leader&per_page=100": {
          data: [membership("44")],
        },
        "/groups/v2/tags/70": { data: { type: "Tag", id: "70", attributes: {} } },
        "/groups/v2/tags/70/groups?per_page=100": {
          data: [{ type: "Group", id: "8", attributes: {} }],
        },
      }) as typeof fetch,
    );
    expect(await dir.sourceLeaderIds("services_team", "5")).toEqual(["42", "43"]);
    expect(await dir.sourceLeaderIds("groups_group", "8")).toEqual(["44"]);
    expect(await dir.sourceLeaderIds("groups_tag", "70")).toEqual(["44"]);
    // Gone, or a bad id: null, so the last known mapping stays.
    expect(await dir.sourceLeaderIds("services_team", "9")).toBeNull();
    expect(await dir.sourceLeaderIds("groups_group", "../x")).toBeNull();
  });

  it("follows pagination for field definitions", async () => {
    const dir = new HttpPlanningCenterDirectory(
      credentials,
      fakeFetch({
        "/people/v2/field_definitions?per_page=100": {
          data: [
            { type: "FieldDefinition", id: "1", attributes: { name: "A", data_type: "string" } },
          ],
          links: {
            next: "https://api.planningcenteronline.com/people/v2/field_definitions?per_page=100&offset=100",
          },
        },
        "/people/v2/field_definitions?per_page=100&offset=100": {
          data: [
            {
              type: "FieldDefinition",
              id: "7",
              attributes: { name: "Ministry Leader", data_type: "boolean" },
            },
          ],
        },
      }) as typeof fetch,
    );
    expect(await dir.findFieldDefinition("Ministry Leader")).toMatchObject({ id: "7" });
  });
});

describe("checkLeader", () => {
  const field = { id: "7", name: "Ministry Leader", dataType: "boolean" };
  const fake = (fieldValues: Record<string, string[]>, status = "active") =>
    new FakePlanningCenterDirectory({
      organizationId: "100",
      fields: [field],
      people: [{ id: "42", name: "Sam", status, emails: ["sam@example.org"], fieldValues }],
    });
  const settings = { fieldName: "Ministry Leader", acceptedValues: ["Yes"] };

  it("treats an inactive Planning Center profile as not a leader", async () => {
    expect(
      await checkLeader(fake({ "7": ["true"] }, "inactive"), settings, { pcoPersonId: "42" }),
    ).toMatchObject({ status: "not_leader" });
  });

  it("reports no person, and an outage, without throwing", async () => {
    expect(await checkLeader(fake({}), settings, { email: "x@example.org" })).toEqual({
      status: "not_found",
    });
    const down = fake({});
    down.data.unavailable = true;
    expect(await checkLeader(down, settings, { pcoPersonId: "42" })).toMatchObject({
      status: "unavailable",
    });
  });
});
