# Decisions and deviations

Record any choice the specs leave open, and any deviation from them.

## Stage 1, step 1

- **Temporary preview user.** Sign-in arrives in step 3. Until then `src/lib/viewer.ts` returns a sample person with every role (or the roles in `PREVIEW_ROLES`), and the app shows a "Preview" banner. Remove both when sign-in lands.
- **Theme preference** is stored in the browser (next-themes) until accounts exist; DRD 3.3 asks for it in the account, which comes with sign-in.
- **Next.js 16 with Cache Components** (the scaffold default). Anything that reads the session must sit behind a `<Suspense>` boundary. See `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.

## Work in progress (handover from the cloud session)

Done, not yet run or tested: scaffold, design tokens (`src/app/globals.css`), roles (`src/lib/roles.ts`), copy (`src/copy/en-CA.ts`), navigation (`src/domain/navigation.ts`), tasks aggregator (`src/domain/tasks/`), `formatCAD` (`src/lib/money.ts`), theme provider, area icons, desktop sidebar.

Still to do for step 1: root layout (Inter, ThemeProvider, `lang="en-CA"`), the `(app)` layout with sidebar, header, preview banner and footer, mobile bottom bar plus "More" menu, account menu (role chips, theme, sign out placeholder), Home page (My tasks empty state, At a glance, Recent activity), placeholder pages for nav links, unit tests, Playwright + axe tests, CI workflow, Prettier config and npm scripts.
