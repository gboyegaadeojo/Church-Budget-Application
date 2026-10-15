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

export interface PlanningCenterDirectory {
  /** The church's organization id, to reject sign-ins from other churches. */
  organizationId(): Promise<string>;
  findPeopleByEmail(email: string): Promise<PcoPerson[]>;
  getPerson(personId: string): Promise<PcoPerson | null>;
  findFieldDefinition(name: string): Promise<PcoFieldDefinition | null>;
  /** The raw values stored for one person and field (several for checkboxes). */
  getFieldValues(personId: string, fieldDefinitionId: string): Promise<string[]>;
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

  async findFieldDefinition(name: string): Promise<PcoFieldDefinition | null> {
    const wanted = name.trim().toLowerCase();
    const defs = await this.getList("/people/v2/field_definitions?per_page=100");
    const match = defs.data.find(
      (d) => text(d, "name").trim().toLowerCase() === wanted && !d.attributes.deleted_at,
    );
    return match
      ? { id: match.id, name: text(match, "name"), dataType: text(match, "data_type") }
      : null;
  }

  async getFieldValues(personId: string, fieldDefinitionId: string): Promise<string[]> {
    if (!/^\d+$/.test(personId) || !/^\d+$/.test(fieldDefinitionId)) return [];
    const data = await this.getList(
      `/people/v2/people/${personId}/field_data?where[field_definition_id]=${fieldDefinitionId}&per_page=100`,
    );
    return data.data.map((d) => text(d, "value"));
  }
}

/** Test and local-development stand-in, loaded from fixtures instead of the network. */
export type FakeDirectoryData = {
  organizationId: string;
  fields: PcoFieldDefinition[];
  people: (PcoPerson & { fieldValues?: Record<string, string[]> })[];
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

  async getFieldValues(personId: string, fieldDefinitionId: string) {
    this.check();
    return this.data.people.find((p) => p.id === personId)?.fieldValues?.[fieldDefinitionId] ?? [];
  }
}
