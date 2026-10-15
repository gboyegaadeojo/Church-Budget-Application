import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * A database handle or an open transaction. Services take a `Tx` and run their whole
 * job (authz → validate → state check → write → audit → outbox) inside it. Any
 * Postgres driver fits: node-postgres in the app, PGlite in local tests.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Db;
