# Performance check (Stage 5)

Requirements 13.1 asks that routine screens feel immediate, that dashboard filters respond efficiently for the church's workload, and that large lists page. FR-52 asks that the Overview stays within those targets for a full year of data. This page records how that was checked and what was found.

## How it's measured

`npm run test:perf` runs `tests/perf/volume.perf.ts`. It isn't part of CI, because seeding takes about 20 seconds. Run it before a release and after any change to a list, dashboard or the activity log.

- **Data:** one budget year at about **three times the church's size**:
  - 40 departments with approved budgets
  - 2,000 expenses across every status, spread over 300 days
  - 5,000 spending entries across the year
  - 50,000 activity log events

  Real records are made through the services, then copied in bulk with SQL.
- **What's timed:** the server work behind each main page, called the way the page calls it, as the person who uses that page. Each is run five times; the median must stay under **1.5 seconds**. The limit is generous on purpose: it catches a query that grows with the data, not small drift.
- **Where:** in-process PGlite by default, the same database the integration tests use. PGlite is single-threaded WebAssembly, so it's several times slower than the hosted Neon Postgres. Treat the numbers as an upper bound. Set `TEST_DATABASE_URL` to time real Postgres.
- **Results** are written to `test-results/performance.md`.

## Results (2026-10-18, PGlite on the development laptop)

| Page or query | Median (ms) | Slowest (ms) |
|---|---:|---:|
| Home: At a glance (accountant) | 481 | 515 |
| Home: expense tasks (accountant) | 72 | 82 |
| Home: Recent activity (admin) | 25 | 31 |
| Annual review dashboard | 8 | 13 |
| Analytics Overview (annual) | 9 | 11 |
| Analytics Overview: spending and expenses | 199 | 206 |
| Expenses: All | 18 | 20 |
| Spending dashboard | 180 | 184 |
| Spending ledger | 54 | 63 |
| Spending export (workbook data) | 363 | 369 |
| Activity tab, page 1 (admin) | 14 | 14 |
| Activity tab, page 500 (admin) | 216 | 237 |
| Activity tab, search (admin) | 1,412 | 1,433 |
| Activity tab (accountant's scope) | 20 | 20 |
| Global search | 9 | 12 |

## What was found and fixed

- **The activity log slowed down on later pages.** Before the fix, page 500 of the Activity tab took **10.8 s** and page 1 took 256 ms. The joins that find the budget and the expense an event is about compared `id::text` with the event's entity id. That can't use the primary-key index, so every event scanned the expense table.
  - The joins now compare uuids, with a guarded cast of the entity id (`src/domain/analytics/activity.ts`). Each join is a single index lookup.
  - Page 500 now takes **216 ms** and page 1 **14 ms**. Home's Recent activity went from 257 ms to 25 ms.

## Known slower spots (acceptable)

- **Activity search** (1.4 s on PGlite) matches the text against eight columns of every event in scope with `ILIKE`. Real Postgres is several times faster, and searches are occasional. If it becomes a problem, a trigram index (`pg_trgm`, available on Neon) on the searched columns is the next step.
- **At a glance for the accountant** (about 0.5 s) builds the full review queue, so its counts always match the Review page. The test leaves about 1,000 expenses waiting for a decision at once, far more than the church will ever have.
- **Exports** build the whole workbook in one request. The spending workbook's data takes about 0.4 s at this size. The download button shows that it's working (Requirements 13.1).
