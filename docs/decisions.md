# Decisions and deviations

Record any choice the specs leave open, and any deviation from them.

## Stage 1, step 1

- **Temporary preview user.** Sign-in arrives in step 3. Until then `src/lib/viewer.ts` returns a sample person with every role (or the roles in `PREVIEW_ROLES`), and the app shows a "Preview" banner. Remove both when sign-in lands.
- **Theme preference** is stored in the browser (next-themes) until accounts exist; DRD 3.3 asks for it in the account, which comes with sign-in.
- **Next.js 16 with Cache Components** (the scaffold default). Anything that reads the session must sit behind a `<Suspense>` boundary. See `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.

- **One placeholder route per navigation link** (`src/components/coming-soon.tsx`), not a catch-all. With Cache Components a catch-all streams its shell before it can call `notFound()`, so unknown paths returned 200. Separate files keep unknown paths a real 404. A unit test checks that every navigation link has a page. Each feature replaces its placeholder file.
- **Account and More menus are non-modal** (`modal={false}`). In modal mode Radix marks the page `aria-hidden` while its links stay focusable, which fails axe (`aria-hidden-focus`). Escape, outside click and focus return still work.
- **`playwright-core` override.** `@axe-core/playwright` pulls a newer `playwright-core` whose `Page` type doesn't match `@playwright/test` 1.56.1. An npm override pins it to the same version.
- **Analytics & Audit (FR-52, docs v3.3)** is in the Reports navigation for every role from now on, and read-only for the Board Chair and Vice-Chair (Requirements 3.6). The page itself arrives in step 8 (Activity tab) and Stage 2 (Overview, Access). Global search and breadcrumbs (DRD 6.0, v3.3) are also step 8.
- **CI** runs format, lint, typecheck, unit and end-to-end with axe. There's no integration job yet because there's no database until step 2. Add it with the schema.
