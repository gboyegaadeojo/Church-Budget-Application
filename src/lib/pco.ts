import { z } from "zod";

/**
 * Planning Center People, read-only (FR-01a, FR-39). The server calls it with the
 * church's Personal Access Token (HTTP Basic, PCO_APP_ID:PCO_PAT_SECRET), so the
 * check works for people who cannot see People data themselves. The app never writes.
 *
 * Everything the app needs goes through `PlanningCenterDirectory`, so tests and local
 * development use `FakePlanningCenterDirectory` instead of the network.
 */

export type PcoPerson = {
  id: string;
  name: string;
  /** "active" or "inactive" in Planning Center. */
  status: string;
  emails: string[];
};

export type PcoFieldDefinition = {
  id: string;
  name: string;
  /** Planning Center's type, e.g. "boolean" for a Yes/No field, "checkboxes", "string". */
  dataType: string;
};

/** A Services team, Groups group or group tag a department can be mapped to (FR-39). */
export type PcoSource = { id: string; name: string };
export type PcoTeamSourceType = "services_team" | "groups_group" | "groups_tag";

export interface PlanningCenterDirectory {
  /** The church's organization id, to reject sign-ins from other churches. */
  organizationId(): Promise<string>;
  findPeopleByEmail(email: string): Promise<PcoPerson[]>;
  getPerson(personId: string): Promise<PcoPerson | null>;
  findFieldDefinition(name: string): Promise<PcoFieldDefinition | null>;
  /** Every People custom field, for the picker in Settings → Planning Center. */
  listFieldDefinitions(): Promise<PcoFieldDefinition[]>;
  /** People whose name or email matches, for "Test a person" (at most 10). */
  searchPeople(query: string): Promise<PcoPerson[]>;
  /** The raw values stored for one person and field (several for checkboxes). */
  getFieldValues(personId: string, fieldDefinitionId: string): Promise<string[]>;
  /** Services teams, Groups groups and group tags, for the department mapping (FR-39). */
  listSources(type: PcoTeamSourceType): Promise<PcoSource[]>;
  /**
   * The Planning Center person ids of a source's leaders: a team's team leaders, a
   * group's leaders, or the leaders of every group with the tag. Null if it no longer exists.
   */
  sourceLeaderIds(type: PcoTeamSourceType, id: string): Promise<string[] | null>;
}

/** Planning Center could not answer: network, timeout, rate limit, outage or bad credentials. */
export class PlanningCenterUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PlanningCenterUnavailableError";
  }
}

const BASE_URL = "https://api.planningcenteronline.com";
const USER_AGENT = "IFC Church Budget (church-budget-application)";
const TIMEOUT_MS = 8_000;

const ref = z.object({ type: z.string(), id: z.string() });
const resource = z.object({
  type: z.string(),
  id: z.string(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  relationships: z
    .record(z.string(), z.object({ data: z.union([ref, z.array(ref), z.null()]).optional() }))
    .optional(),
});
type Resource = z.infer<typeof resource>;

/** The ids a relationship points to, whether to-one or to-many. */
function relatedIds(r: Resource, name: string): string[] {
  const data = r.relationships?.[name]?.data;
  if (!data) return [];
  return Array.isArray(data) ? data.map((d) => d.id) : [data.id];
}

const single = z.object({ data: resource, included: z.array(resource).optional() });
const list = z.object({
  data: z.array(resource),
  included: z.array(resource).optional(),
  links: z.object({ next: z.string().optional() }).optional(),
  meta: z.object({ parent: z.object({ id: z.string(), type: z.string() }).optional() }).optional(),
});

const text = (r: Resource, key: string): string => {
  const value = r.attributes[key];
  return typeof value === "string" ? value : "";
};

function toPerson(person: Resource, included: Resource[] = []): PcoPerson {
  const emailIds = new Set(relatedIds(person, "emails"));
  const emails = included
    .filter((r) => r.type === "Email" && emailIds.has(r.id))
    .map((r) => text(r, "address").trim().toLowerCase())
    .filter(Boolean);
  return {
    id: person.id,
    name: text(person, "name"),
    status: text(person, "status") || "active",
    emails,
  };
}

export type PlanningCenterCredentials = { appId: string; secret: string };

/** The real directory, over HTTPS with the church's Personal Access Token. */
export class HttpPlanningCenterDirectory implements PlanningCenterDirectory {
  private readonly authorization: string;
  private orgId: string | undefined;

  constructor(
    credentials: PlanningCenterCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.authorization = `Basic ${Buffer.from(`${credentials.appId}:${credentials.secret}`).toString("base64")}`;
  }

  /** GET a People API path. Returns null on 404; throws PlanningCenterUnavailableError otherwise. */
  private async get(path: string): Promise<unknown | null> {
    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, BASE_URL), {
        headers: {
          Authorization: this.authorization,
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (cause) {
      throw new PlanningCenterUnavailableError("Planning Center could not be reached", { cause });
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      const reason =
        response.status === 401 || response.status === 403
          ? "credentials were rejected"
          : `answered ${response.status}`;
      throw new PlanningCenterUnavailableError(`Planning Center ${reason}`);
    }
    try {
      return await response.json();
    } catch (cause) {
      throw new PlanningCenterUnavailableError("Planning Center sent an unreadable answer", {
        cause,
      });
    }
  }

  private async getList(path: string, maxPages = 10): Promise<z.infer<typeof list>> {
    const all: z.infer<typeof list> = { data: [], included: [] };
    let next: string | undefined = path;
    for (let page = 0; next && page < maxPages; page++) {
      const body = list.safeParse(await this.get(next));
      if (!body.success)
        throw new PlanningCenterUnavailableError("Unexpected Planning Center data");
      all.data.push(...body.data.data);
      all.included!.push(...(body.data.included ?? []));
      all.meta ??= body.data.meta;
      next = body.data.links?.next;
    }
    return all;
  }

  async organizationId(): Promise<string> {
    if (this.orgId) return this.orgId;
    const body = await this.get("/people/v2");
    const parsed = single.safeParse(body);
    if (!parsed.success || parsed.data.data.type !== "Organization") {
      throw new PlanningCenterUnavailableError("Planning Center did not return the organization");
    }
    this.orgId = parsed.data.data.id;
    return this.orgId;
  }

  async getPerson(personId: string): Promise<PcoPerson | null> {
    if (!/^\d+$/.test(personId)) return null;
    const body = await this.get(`/people/v2/people/${personId}?include=emails`);
    if (body === null) return null;
    const parsed = single.safeParse(body);
    if (!parsed.success)
      throw new PlanningCenterUnavailableError("Unexpected Planning Center data");
    return toPerson(parsed.data.data, parsed.data.included);
  }

  async findPeopleByEmail(email: string): Promise<PcoPerson[]> {
    const address = email.trim().toLowerCase();
    const emails = await this.getList(
      `/people/v2/emails?where[address]=${encodeURIComponent(address)}&per_page=25`,
      1,
    );
    const ids = new Set(
      emails.data
        .filter((e) => text(e, "address").trim().toLowerCase() === address)
        .flatMap((e) => relatedIds(e, "person")),
    );
    const people = await Promise.all([...ids].map((id) => this.getPerson(id)));
    return people.filter((p): p is PcoPerson => p !== null);
  }

  async listFieldDefinitions(): Promise<PcoFieldDefinition[]> {
    const defs = await this.getList("/people/v2/field_definitions?per_page=100");
    return defs.data
      .filter((d) => !d.attributes.deleted_at)
      .map((d) => ({ id: d.id, name: text(d, "name"), dataType: text(d, "data_type") }));
  }

  async findFieldDefinition(name: string): Promise<PcoFieldDefinition | null> {
    const wanted = name.trim().toLowerCase();
    const defs = await this.listFieldDefinitions();
    return defs.find((d) => d.name.trim().toLowerCase() === wanted) ?? null;
  }

  async searchPeople(query: string): Promise<PcoPerson[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const people = await this.getList(
      `/people/v2/people?where[search_name_or_email]=${encodeURIComponent(q)}&include=emails&per_page=10`,
      1,
    );
    return people.data.map((p) => toPerson(p, people.included));
  }

  async getFieldValues(personId: string, fieldDefinitionId: string): Promise<string[]> {
    if (!/^\d+$/.test(personId) || !/^\d+$/.test(fieldDefinitionId)) return [];
    const data = await this.getList(
      `/people/v2/people/${personId}/field_data?where[field_definition_id]=${fieldDefinitionId}&per_page=100`,
    );
    return data.data.map((d) => text(d, "value"));
  }

  async listSources(type: PcoTeamSourceType): Promise<PcoSource[]> {
    const current = (r: Resource) => !r.attributes.archived_at && !r.attributes.deleted_at;
    if (type === "groups_tag") {
      const groups = await this.getList("/groups/v2/tag_groups?include=tags&per_page=100");
      const tags = new Map(
        (groups.included ?? []).filter((t) => t.type === "Tag").map((t) => [t.id, t]),
      );
      return groups.data.flatMap((g) =>
        relatedIds(g, "tags").flatMap((id) => {
          const tag = tags.get(id);
          return tag ? [{ id, name: `${text(g, "name")}: ${text(tag, "name")}` }] : [];
        }),
      );
    }
    const path = type === "services_team" ? "/services/v2/teams" : "/groups/v2/groups";
    const rows = await this.getList(`${path}?per_page=100`);
    return rows.data.filter(current).map((r) => ({ id: r.id, name: text(r, "name") }));
  }

  /** The leaders of one group, or null if the group is gone. */
  private async groupLeaderIds(groupId: string): Promise<string[] | null> {
    const exists = await this.get(`/groups/v2/groups/${groupId}`);
    if (exists === null) return null;
    const members = await this.getList(
      `/groups/v2/groups/${groupId}/memberships?where[role]=leader&per_page=100`,
    );
    return members.data
      .filter((m) => text(m, "role") === "" || text(m, "role") === "leader")
      .flatMap((m) => relatedIds(m, "person"));
  }

  async sourceLeaderIds(type: PcoTeamSourceType, id: string): Promise<string[] | null> {
    if (!/^\d+$/.test(id)) return null;
    if (type === "services_team") {
      const team = await this.get(`/services/v2/teams/${id}`);
      if (team === null) return null;
      const leaders = await this.getList(`/services/v2/teams/${id}/team_leaders?per_page=100`);
      return unique(
        leaders.data.flatMap((l) => [...relatedIds(l, "people"), ...relatedIds(l, "person")]),
      );
    }
    if (type === "groups_group") return this.groupLeaderIds(id);
    const tag = await this.get(`/groups/v2/tags/${id}`);
    if (tag === null) return null;
    const groups = await this.getList(`/groups/v2/tags/${id}/groups?per_page=100`);
    const all: string[] = [];
    for (const g of groups.data) all.push(...((await this.groupLeaderIds(g.id)) ?? []));
    return unique(all);
  }
}

const unique = (ids: string[]) => [...new Set(ids)];

/** Test and local-development stand-in, loaded from fixtures instead of the network. */
export type FakeDirectoryData = {
  organizationId: string;
  fields: PcoFieldDefinition[];
  people: (PcoPerson & { fieldValues?: Record<string, string[]> })[];
  /** Services teams with their team leaders' person ids (FR-39). */
  teams?: (PcoSource & { leaderIds: string[] })[];
  /** Groups with their leaders' person ids and tag ids. */
  groups?: (PcoSource & { leaderIds: string[]; tagIds?: string[] })[];
  /** Group tags, named "Tag group: Tag". */
  tags?: PcoSource[];
  /** Simulate an outage. */
  unavailable?: boolean;
};

export class FakePlanningCenterDirectory implements PlanningCenterDirectory {
  constructor(public data: FakeDirectoryData) {}

  private check() {
    if (this.data.unavailable) throw new PlanningCenterUnavailableError("Fake outage");
  }

  async organizationId() {
    this.check();
    return this.data.organizationId;
  }

  async findPeopleByEmail(email: string) {
    this.check();
    const address = email.trim().toLowerCase();
    return this.data.people.filter((p) => p.emails.includes(address));
  }

  async getPerson(personId: string) {
    this.check();
    return this.data.people.find((p) => p.id === personId) ?? null;
  }

  async findFieldDefinition(name: string) {
    this.check();
    const wanted = name.trim().toLowerCase();
    return this.data.fields.find((f) => f.name.toLowerCase() === wanted) ?? null;
  }

  async listFieldDefinitions() {
    this.check();
    return this.data.fields;
  }

  async searchPeople(query: string) {
    this.check();
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return this.data.people
      .filter((p) => p.name.toLowerCase().includes(q) || p.emails.some((e) => e.includes(q)))
      .slice(0, 10);
  }

  async getFieldValues(personId: string, fieldDefinitionId: string) {
    this.check();
    return this.data.people.find((p) => p.id === personId)?.fieldValues?.[fieldDefinitionId] ?? [];
  }

  async listSources(type: PcoTeamSourceType) {
    this.check();
    const rows =
      type === "services_team"
        ? (this.data.teams ?? [])
        : type === "groups_group"
          ? (this.data.groups ?? [])
          : (this.data.tags ?? []);
    return rows.map(({ id, name }) => ({ id, name }));
  }

  async sourceLeaderIds(type: PcoTeamSourceType, id: string) {
    this.check();
    if (type === "services_team")
      return this.data.teams?.find((t) => t.id === id)?.leaderIds ?? null;
    if (type === "groups_group")
      return this.data.groups?.find((g) => g.id === id)?.leaderIds ?? null;
    if (!this.data.tags?.some((t) => t.id === id)) return null;
    return unique(
      (this.data.groups ?? []).filter((g) => g.tagIds?.includes(id)).flatMap((g) => g.leaderIds),
    );
  }
}
