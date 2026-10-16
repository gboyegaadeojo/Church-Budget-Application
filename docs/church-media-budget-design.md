# Church Media Budget Submission Application
## Product Design, Visual Experience, Motion & Interaction Requirements

**Organization:** Immanuel Fellowship Church (IFC)
**Document:** Design Requirements Document (DRD)
**Version:** 3.3
**Status:** Final design requirements for build
**Companion documents:** [Requirements (PRD/SRS) v3.3](church-media-budget-requirements.md) · [User manual](user-manual.md) · [README](../README.md) · [Build guide for Claude Code](../CLAUDE.md). Where the two documents differ on behavior, the requirements win; this document governs look, feel, and interaction.
**Audience:** Designers, Claude Code (developer), testers, and the church's product owner.

### Version history

| Version | Date | Summary |
|---|---|---|
| 1.0 | — | Initial design baseline from the church. |
| 1.1–2.3 | 2026-10-15 | Contrast fixes; 3-step form with sticky totals; full status vocabulary; role navigation; money formatting; branding; English only; email set; messages; Annual Budget vs Expenses areas; Planning Center sign-in states; "Other" department; scheduled decision release; two-level expense approval; Ready to process and Record payment. Appendix A lists the v1.0 → v1.1 review changes. |
| 3.3 | 2026-10-15 | Continue with email on sign-in; Change deadline and extensions; Signing authorities screen. Also: Primary and Backup requester chips and cover banner; Planning Center mapping on Departments; Analytics & Audit dashboard (6.13); global search and breadcrumbs for easier navigation. |
| 3.2 | 2026-10-15 | Reopen action, board total vs allocated indicator, "How will this be bought" on purchase requests. |
| 3.1 | 2026-10-15 | One application: Home with My tasks across roles, navigation grouped by area, Vice-Chair, administrator read-only views of everything. |
| 3.0 | 2026-10-15 | Consolidated for build: "(new)" markers removed, navigation cleaned, open questions resolved into decisions. No design changes. |

---

# 1. Executive Design Vision

## 1.1 Vision

Design a premium, trustworthy, welcoming, and highly interactive church budget management application that combines the polish of a leading financial software product with the warmth and accessibility of a community-oriented organization.

The application must feel intentionally designed rather than assembled from generic dashboard templates.

Every page, animation, transition, icon, emoji, number, notification, and interaction must contribute to a coherent experience.

The product must be visually engaging without compromising financial accuracy, accessibility, performance, security, or usability.

## 1.2 Experience goals

The application should feel:

- **Premium:** Refined typography, intentional spacing, high-quality components, and precise visual alignment.
- **Trustworthy:** Clear financial figures, predictable interactions, transparent approvals, and visible audit history.
- **Modern:** Responsive layouts, subtle depth, smooth transitions, contextual menus, and interactive data visualization.
- **Welcoming:** Friendly copy, approachable empty states, helpful guidance, and carefully used emoji.
- **Intelligent:** Totals update immediately, forms prevent common mistakes, and the interface anticipates the user's next step.
- **Efficient:** Common actions are easy to find and require minimal unnecessary navigation.
- **Accessible:** Usable by volunteers and staff with different levels of technical experience.
- **Consistent:** Shared components, interaction rules, motion patterns, and terminology throughout the application.

## 1.3 Design philosophy

The guiding principle is:

**Clarity first. Confidence always. Delight where it matters.**

Animations must not exist merely to make the application appear sophisticated. They should help users understand what happened, where they are, what changed, and what they can do next.

A budget application is a financial tool. It must communicate authority and precision even when it uses playful details.

## 1.4 Reference quality

Use the following products as directional quality references, not as templates to copy:

- Apple: visual refinement, typography, restraint, and consistency.
- Linear: interaction speed, keyboard accessibility, and precise feedback.
- Stripe: financial clarity, thoughtful forms, and trustworthy data presentation.
- Notion: approachable interfaces, useful empty states, and flexible information organization.
- Google Workspace: familiar authentication and predictable interaction patterns.

The final product must have its own identity appropriate to Immanuel Fellowship Church. The church's logo, name, and accent color are set by the administrator in Settings → Branding (see 3.8) and can be changed at any time without a code change.

---

# 2. Design Principles

## 2.1 Purposeful motion

Every animation must communicate an event, establish hierarchy, guide attention, or improve perceived responsiveness.

## 2.2 Financial clarity

Requested totals, sales tax, approved totals, spending, and remaining balances must never be ambiguous. Every amount on screen carries a label that says what it is (for example "Total (incl. tax)", "Remaining", "Over budget by").

## 2.3 Progressive disclosure

Show the information users need at the current stage. Reveal advanced information when appropriate rather than overwhelming first-time users.

## 2.4 Immediate feedback

Users must always understand whether an action is processing, saved, successful, unsuccessful, or awaiting another decision.

## 2.5 Friendly, not childish

Use emoji and expressive illustrations selectively. Financial approvals, declines, and spending reports must remain professional.

## 2.6 Accessible by default

Keyboard navigation, contrast, focus states, screen readers, responsive layouts, and reduced-motion preferences must be designed into the component system.

## 2.7 Consistent interaction language

The same action must behave consistently across the application. Buttons, menus, modals, toasts, status badges, and confirmation dialogs must share predictable patterns.

---

# 3. Visual Design System

## 3.1 Proposed visual direction

Create a clean, premium financial SaaS interface using neutral surfaces, confident typography, a restrained accent color, subtle shadows, and carefully controlled visual emphasis.

The application should not look like a spreadsheet with a navigation sidebar. It should feel like a cohesive software product.

## 3.2 Color palette

Use semantic design tokens rather than scattering raw color values throughout the codebase.

Contrast ratios below were measured against Background / Surface / Surface secondary. WCAG 2.2 AA needs 4.5:1 for normal text and 3:1 for large text, icons, and control boundaries.

### Light theme

| Token | Value | Purpose | Contrast (Bg / Surface / Surface 2) |
|---|---|---|---|
| Background | `#F7F7FA` | Main application background | — |
| Surface | `#FFFFFF` | Cards, forms, dialogs | — |
| Surface secondary | `#F1F2F6` | Secondary panels | — |
| Text primary | `#18181B` | Headings and essential text | > 15:1 |
| Text secondary | `#656572` | Supporting information | 5.4 / 5.7 / 5.1 |
| Border | `#E4E4EA` | Decorative dividers and card edges only | 1.2 (decorative) |
| Border strong | `#8A8A96` | Input, select, checkbox boundaries | 3.2 / 3.4 / 3.1 |
| Primary accent | `#6D45D8` | Primary actions and active states; white text on it is 6.0:1 | 5.6 / 6.0 / 5.4 |
| Accent hover | `#5934BD` | Hover state | — |
| Success (changed) | `#1C7A4A` (was `#218653`, 4.3:1 on background) | Successful operations and approval | 5.0 / 5.3 / 4.8 |
| Warning (changed) | `#965A08` (was `#A8640A`, 4.4:1 on background) | Caution and approaching limits | 5.2 / 5.6 / 5.0 |
| Danger | `#C43D46` | Destructive actions, declines, over budget | 4.8 / 5.1 / 4.6 |
| Information | `#3267B1` | Informational messages | 5.3 / 5.7 / 5.1 |

### Dark theme

| Token | Value | Purpose | Contrast (Bg / Surface / Surface 2) |
|---|---|---|---|
| Background | `#08080A` | Main application background | — |
| Surface | `#101014` | Cards and form surfaces | — |
| Surface secondary | `#17171D` | Secondary panels | — |
| Surface hover | `#202027` | Hover and selected surfaces | — |
| Text primary | `#F5F5F7` | Main text | > 15:1 |
| Text secondary | `#A3A3B0` | Supporting text | 8.0 / 7.6 / 7.2 |
| Border | `#292931` | Decorative dividers and card edges only | 1.3 (decorative) |
| Border strong | `#6A6A78` | Input, select, checkbox boundaries | 3.8 / 3.6 / 3.4 |
| Primary accent | `#A78BFA` | Primary actions and active states | 7.4 / 7.0 / 6.6 |
| On-accent text | `#08080A` | Text on primary buttons in dark mode (white on `#A78BFA` is only 2.7:1) | 7.4 on accent |
| Accent hover | `#B9A4FF` | Hover state | — |
| Success | `#4CCB86` | Successful operations and approval | 9.7 / 9.2 / 8.7 |
| Warning | `#F0B65A` | Caution | 11.0 / 10.4 / 9.8 |
| Danger | `#FF777F` | Destructive actions, declines, over budget | 7.8 / 7.4 / 7.0 |
| Information | `#8DB9FF` | Informational messages | 10.0 / 9.5 / 8.9 |

These are starting tokens. Contrast must be re-tested for actual text, borders, controls, focus rings, and states before release.

Do not use color alone to communicate meaning. Pair status colors with labels and appropriate icons.

## 3.3 Theme requirements

Support three user-selectable modes:

- Light
- Dark
- System

System mode must follow the operating system's color preference.

Theme changes should apply smoothly without a flash of the wrong theme (set the theme before first paint). Avoid transitions that make the entire interface flicker or cause text to become temporarily unreadable.

Store the user's explicit theme preference in their account. If no preference exists, use System.

Excel exports and emails are always light-themed regardless of the user's setting.

## 3.4 Typography

Use a contemporary, highly legible sans-serif typeface. Recommended: **Inter** (variable, with tabular numerals), falling back to the system font stack.

Recommended hierarchy:

| Element | Approximate size |
|---|---:|
| Main page heading | 28–34 px |
| Section heading | 20–24 px |
| Card heading | 16–18 px |
| Body text | 16 px (14 px minimum for dense tables) |
| Supporting text | 12–14 px |
| Form label | 14 px |
| Table content | 14 px |
| Financial total | 28–36 px |

Form inputs use at least 16 px text on mobile so iOS does not zoom on focus.

Use font weight and spacing to establish hierarchy. Avoid excessive bold text, all-caps headings, or numerous competing text sizes.

Financial amounts must use tabular numerals (`font-variant-numeric: tabular-nums`) and be right-aligned in tables.

## 3.5 Spacing and layout

Use a consistent spacing scale based on multiples of four pixels.

Suggested scale:

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`

Requirements:

- Use consistent card padding.
- Align headings and tables to a shared grid.
- Avoid cramped forms and unnecessarily large empty areas.
- Maintain sufficient space between financial values and their labels.
- Use consistent modal widths and page gutters (16 px minimum on mobile).
- Make the main requested or approved total easy to identify.
- Avoid excessive nested cards.

## 3.6 Border radius and elevation

Recommended radii:

- Small controls: 6–8 px.
- Inputs and buttons: 8–10 px.
- Standard cards: 12–16 px.
- Large dialogs: 16–20 px.
- Pills and status labels: fully rounded where appropriate.

Use subtle borders and restrained shadows. Elevation should communicate hierarchy, not decorate every surface. In dark mode, express elevation with lighter surfaces rather than shadows.

## 3.7a Language

The application is English (Canada) only: Canadian spelling, `en-CA` dates (e.g. "Oct 15, 2026") and currency. Keep interface copy in one file so wording is consistent and easy to edit.

## 3.7 Money formatting

One formatting rule everywhere (screens, emails, exports):

- Locale `en-CA`, currency CAD, two decimals: `$1,148.00`.
- Show "CAD" once per page or summary (e.g. in the summary heading), not after every amount.
- Never show a bare negative for business meaning. Use words:
  - Over budget: **"Over budget by $1,250.00"** in Danger color with an icon.
  - Refund: label **"Refund"** with the amount shown as `−$500.00`.
  - Approved less than requested: **"$2,000.00 less than requested"**.
- Tax line always shows the rate from the request: **"Sales tax (12%)"**.
- Percentages for utilization: whole numbers on cards (`43%`), one decimal in tables (`43.2%`).
- Amounts are formatted by the same shared module that calculates them (see PRD/SRS FR-07).

## 3.8 Branding (administrator-managed)

The administrator can change the church's branding at any time from **Settings → Branding**:

- **Logo:** PNG, JPG, or SVG, maximum 1 MB, shown in the sidebar, sign-in screen, emails, Excel header, and print layout. An optional square icon version is used for the browser tab and mobile home screen. Uploaded SVGs are sanitized. This is the only file upload in the application and is limited to administrators; the no-attachments rule for budget requests and spending is unchanged.
- **Church name and application name**, shown in the header, sign-in screen, emails, and exports.
- **Accent color:** a color picker (hex input). The app generates the hover, light, and dark-theme variants from it.
- **Live preview** of the sign-in screen, a button, a badge, and an email header in light and dark themes before saving.
- **Automatic contrast check:** the app tests the chosen color against the rules in 3.2 (button text 4.5:1, accent text 4.5:1 on backgrounds). If the color fails, the app shows the problem and offers the nearest passing shade; it does not save a failing color.
- **Reset to default** restores the purple tokens in 3.2.
- Only the accent and logo are brand-controlled. Semantic colors (success, warning, danger, information) stay fixed so statuses always mean the same thing.
- Branding changes take effect for all users immediately and are recorded in the audit log.

---

# 4. Iconography, Emoji, and Expression

## 4.1 Icon system

Use a consistent line-icon family, such as Lucide, for functional controls.

Icons must have consistent stroke weight, size, and alignment. Icon-only buttons need an accessible name and a tooltip.

Examples:

- Dashboard: layout-grid.
- Requests: clipboard-list.
- Departments: building-2.
- Budget items: package.
- Spending: wallet.
- Refund: undo-2.
- Void: ban.
- Amendment: file-pen-line.
- Reports: chart-no-axes-combined.
- Notifications: bell.
- Settings: settings.
- Search: search.
- Export: file-spreadsheet.
- Approval: check-circle.
- Clarification: message-circle.
- Decline: circle-x.
- Locked: lock.
- Help: circle-help.

Decorative icon variations must not create inconsistent meanings for the same action.

## 4.2 Emoji policy

Emoji are encouraged when they add warmth or recognition.

Appropriate examples:

- 👋 Welcome messages.
- 🎯 Budget cycle goals.
- 💰 Budget and spending summaries (headings only).
- 🧾 Submission receipts.
- 🛒 Requested equipment.
- 📊 Financial reports.
- 🎉 Successful submission.
- 💡 Helpful guidance.
- ⏳ Pending review.
- ⚠️ Budget warnings.

Rules:

1. Use emoji primarily in welcome areas, onboarding, empty states, and lightweight confirmations.
2. Keep approval controls, financial tables, the spending ledger, and status badges free of emoji.
3. Never replace important text with an emoji.
4. Do not use emoji as the only indicator of a status.
5. Avoid emoji in every card title or every table row.
6. Avoid celebratory effects for declines, errors, overspending, or sensitive financial decisions.
7. Use native emoji consistently and test rendering across major operating systems.
8. Use an icon instead when exact visual consistency is essential.
9. In emails, emoji may appear in the body greeting only, not in subject lines (some clients and spam filters handle them poorly).
10. Decorative emoji are hidden from screen readers (`aria-hidden="true"`).

## 4.3 Illustrations

Optional illustrations may be used for:

- First-time onboarding.
- No budgets submitted yet.
- No pending approvals.
- No spending recorded yet.
- Empty search results.
- Successful annual budget completion.

Illustrations must be lightweight, visually consistent, and secondary to the actual information.

---

# 5. Motion Design System

Motion is a first-class part of the product design, not a final layer added after development.

## 5.1 Motion objectives

Motion must:

- Explain state changes.
- Make interactions feel responsive.
- Guide the user's attention.
- Provide confirmation.
- Improve spatial understanding.
- Make the product feel polished.
- Avoid interrupting work.

## 5.2 Motion tokens

Establish reusable motion tokens.

| Token | Duration | Intended use |
|---|---:|---|
| Instant | 0–100 ms | Immediate feedback and subtle state changes |
| Fast | 120–160 ms | Button states, small hover effects |
| Standard | 180–240 ms | Dropdowns, tooltips, small panels |
| Emphasized | 260–360 ms | Dialogs, page transitions, larger panels |
| Celebration | 400–700 ms | Rare success moments |
| Continuous | Context-dependent | Loading indicators and progress |

These values are guidelines, not mandatory durations for every animation.

Prefer ease-out for elements entering, ease-in for elements leaving, and a smooth standard easing curve for state changes.

Avoid spring effects that overshoot financial values, cause excessive bouncing, or make the application feel toy-like.

## 5.3 Button interactions

Every interactive button must have appropriate states:

- Default.
- Hover.
- Focus-visible.
- Pressed.
- Disabled.
- Loading.
- Success, when appropriate.

Expected behavior:

- Subtle color or surface changes on hover.
- Small, restrained press feedback.
- Visible keyboard focus (2 px ring, at least 3:1 against adjacent colors).
- Loading indicators during asynchronous actions; the button keeps its width so the layout does not shift.
- Prevention of duplicate submissions while an operation is processing.
- Clear success or failure feedback.

Never animate a button in a way that moves it away from the user's pointer or changes the layout unexpectedly.

Disabled buttons that block an important action (for example **Edit submitted request** after two edits) must explain why, in visible text nearby, not only in a tooltip.

## 5.4 Card interactions

Cards may use:

- Subtle elevation changes.
- Border emphasis on hover.
- Small surface transitions.
- Smooth expansion when details are revealed.

Only cards that are actually interactive should receive clickable hover styling.

Do not make an entire card clickable if it contains unrelated actions that could trigger accidentally.

## 5.5 Navigation transitions

Navigation must feel fluid and predictable.

- Active navigation indicators should transition smoothly.
- Sidebars may collapse and expand.
- Dropdown menus should open and close with subtle motion.
- Dialogs should enter and exit without abrupt visual changes.
- Page transitions must not create noticeable delays.

Respect browser navigation and preserve relevant form state.

## 5.6 Form animations

Use motion to reinforce form progression.

Examples:

- Newly added line items enter with a short fade and slight vertical movement, and focus moves to the new item's name field.
- Removed items transition out before the layout settles, with an **Undo** toast for a few seconds (in addition to the confirmation for populated items).
- Validation errors appear next to the relevant field.
- Form steps transition smoothly.
- The preview enters as a clear, distinct review stage.
- Save confirmations appear without covering input fields.

Animations must not prevent immediate typing or cause financial values to jump unexpectedly.

## 5.7 Animated financial totals

Totals are a primary visual feature.

When quantities or prices change:

- Update the calculated amount promptly.
- Optionally use a restrained number transition (fast token, no count-up from zero).
- Keep the number readable throughout the update.
- Do not delay the authoritative value until an animation finishes.
- Do not animate on every keystroke; animate when the user leaves the field or pauses.
- Screen readers announce the new Total (incl. tax) politely after the user pauses, not on every keystroke.

The displayed value must always represent the current valid calculation.

For example, if a requester changes a quantity from 2 to 3, the line total, subtotal, sales tax, and final total should update together.

## 5.8 Loading states

Use skeletons for larger areas when the expected wait is noticeable.

Use inline progress indicators for individual actions.

Examples:

- Loading the accountant dashboard.
- Fetching a department's requests.
- Loading the spending ledger.
- Generating an Excel workbook.
- Saving a draft.
- Sending a submission to the server.

Do not display skeletons when a simple immediate state change is sufficient.

## 5.9 Success and celebration

Use restrained celebration when a meaningful milestone occurs.

Appropriate moments:

- Successful submission (requester).
- Annual budget cycle completion (accountant, when every department is decided).

A small animated checkmark, brief confirmation, or subtle confetti effect may be appropriate for a major milestone. A requester opening an approved request may see a calm success state (checkmark and "Approved"), not confetti, because the approved amount may be less than requested.

Confetti must be optional, brief, and disabled when reduced motion is requested.

Do not celebrate autosaves, edits, table updates, spending entries, or the accountant's own approve/decline actions.

## 5.10 Reduced motion

Respect the operating system's reduced-motion preference.

When reduced motion is enabled:

- Remove decorative movement.
- Replace large transitions with immediate state changes or subtle fades.
- Disable confetti, number transitions, and parallax.
- Preserve all essential feedback and status changes.
- Never rely on animation to communicate a necessary fact.

---

# 6. Core Screen Design Requirements

## 6.0 One application: Home and navigation

Everyone uses the same app. After sign-in, every person lands on **Home**:

- **My tasks** (top, most prominent): a single list of everything waiting for this person across all their roles. Each row shows an icon for the area (Annual Budget, Expenses, Spending, Admin), a plain-language action ("Final approval needed"), the item and amount, how long it has waited, and one button. An empty state reads "You're all caught up."
- **At a glance** cards, one per role the person holds, e.g. "Media budget: $30,000.00 · $24,792.00 remaining" (requester), "4 awaiting review" (accountant), "2 waiting for your approval" (Board Chair / Vice-Chair), "$2,140.00 to pay" (Church Administrator), "1 proposed department" (administrator).
- **Recent activity** for items they are involved in.

Navigation is grouped by **area**, not by role, and shows only what the person's roles allow:

| Area | Items (shown if any role allows) |
|---|---|
| Home | My tasks, at a glance, activity |
| Annual Budget | Submit / my department's budget (requester); Review dashboard, Departments, Decision release (accountant); All budgets (administrator, read-only) |
| Expenses | New expense, My expenses (requester); Review queue (accountant); Awaiting my approval (Board Chair, Vice-Chair); Ready to process (Church Administrator, accountant); All expenses (administrator, read-only) |
| Spending | My department budget (requester); Spending dashboard, Record spending, Ledger (Church Administrator, accountant); Budget vs actual (Board Chair, Vice-Chair, administrator: read-only) |
| Reports | Exports allowed by the person's roles (administrator: all); **Analytics & Audit** (6.13), scoped to the person's roles |
| Admin | Users & Roles, Departments (incl. Primary and Backup, Planning Center mapping, Proposed), Budget Cycles, Settings (tax, Planning Center, branding, email), Notifications & Audit (administrator only) |

Account menu (all): theme, email preferences, Away (accountant, Board Chair, Vice-Chair), sign out. Footer: Help, Privacy.

The person's roles appear as small chips in the account menu ("Accountant · Requester: Media"), not as a role switcher. There is never a need to sign out to act in another role.

**Administrator read-only views:** every screen the administrator can see but not act on shows the same layout as for the acting role, with decision and payment controls replaced by a muted "View only" label, so nothing looks actionable that isn't.

Desktop uses a collapsible sidebar; mobile uses a bottom bar (Home, Annual Budget, Expenses, Spending) plus a "More" menu.

**Finding things quickly (easy navigation):**

- **Global search** in the top bar (keyboard: `/` or `Ctrl/Cmd + K`): type a reference number (`EXP-2027-0042`), department, person, or item name and jump straight to it. Results are grouped (Annual budgets, Expenses, Departments, People, Pages) and only include what the person's roles allow.
- **Breadcrumbs** on every page below the top level ("Expenses / Review queue / EXP-2027-0042").
- Every list remembers its filters and sorting in the address, so the Back button and shared links return to the same view.
- Every reference number, department name and person name in tables, the activity log and charts is a link to that item.
- Empty states always offer the next action ("No expenses yet. **New expense**").

## 6.1 Sign-in screen

Create a welcoming, professional sign-in experience.

Include:

- Church application identity.
- Clear product name.
- Short description of the application.
- **Continue with Planning Center** button, following its brand guidelines, then a quieter "Not in Planning Center? **Continue with email**" text button (FR-01b, Church Administrator and System Administrators only; Google sign-in removed 2026-10-15, see docs/decisions.md) that opens an email field, then a 6-digit code field (one input with `autocomplete="one-time-code"`, paste-friendly). There is no authenticator step. A line underneath: "Department leaders: your Group Leader status in Planning Center is checked when you sign in."
- Access restriction explanation where appropriate.
- Helpful access-request instructions.
- Short privacy note (what is stored: name, email, budget data).

Do not overwhelm the screen with unnecessary illustrations or marketing content.

## 6.1a Access denied screen

Shown when a person signs in but cannot be given access. Variants:

- **Not found:** "We couldn't find you in the church's Planning Center" (Google sign-in with no matching Planning Center email).
- **Not a leader:** "Submitting budgets is for Group Leaders. Your Planning Center profile isn't marked as a Group Leader." with who to contact.
- **Suspended:** "Your Group Leader status in Planning Center could not be confirmed. Your drafts are saved."
- **Waiting for department:** "You're verified. An administrator will assign your department shortly." (calm, Information style, not an error).
- **Planning Center unavailable:** "We can't reach Planning Center right now. Please try again shortly."
- **Not on the allowlist / deactivated** (staff roles).

Each variant:

- Plain explanation.
- The email address that was used, with **Use a different account**.
- Who to contact (administrator email from Settings).
- No budget data is shown.

## 6.2 Requester dashboard

The dashboard should answer four questions immediately:

1. What budget cycle is open, and when is the deadline?
2. What have I submitted?
3. What requires my attention?
4. What should I do next?

Recommended components:

- Welcome message.
- Active budget cycle and deadline (with days remaining).
- Before approval: **Submit annual budget** primary action (or **Continue draft**), with a secondary **Start from last year's budget**.
- After approval: **New expense** becomes the primary action, and the annual budget card shows the approved amount.
- Drafts.
- Submitted requests with status and remaining edits ("1 of 2 edits left").
- Requests returned for clarification, shown first and highlighted as needing action.
- Approved requests.
- **My department budget** panel (see 6.2a).
- Recent activity.

Use cards sparingly. The most important action should have clear visual priority.

Closed cycle state: explain that submissions are closed and who to contact.

## 6.2a My department budget panel

Read-only, for each department the requester represents:

- Approved total, amendments, available budget, spent, remaining.
- Utilization bar with percentage and status label (On track / Nearing limit / Over budget).
- Spending entries list: date, payee, description, amount. Payment method and reference numbers are not shown to requesters.
- Empty state before approval: "Your budget will appear here once it's approved."

## 6.3 Budget creation form

Use **three steps**, with the financial summary always visible rather than as its own step (fewer clicks, and the total is in view while entering items):

**Step 1: Request information**

- Budget year (pre-selected to the open cycle).
- Department selector: searchable combobox of all active departments (the user's own first, labelled "Yours"), with **Other (type your department)** pinned at the bottom. Choosing Other reveals a text field; as they type, close matches appear ("Did you mean Media Ministry?"). A note under the field: "An administrator will add this department. You can still finish and submit." If the chosen department already has a budget started, an inline card offers **Open it** instead of starting a duplicate.
- Request title.
- Required justification ("Why are you requesting this budget?") with character counter and prompt text.

**Step 2: Budget items**

- Item name.
- Quantity.
- Unit price, labeled **"Unit price (before tax)"**.
- Optional product link.
- Optional notes.
- Automatically calculated line total.
- Add, remove, and reorder controls (drag handle plus keyboard-accessible Move up / Move down).
- **Sticky financial summary**: side panel on desktop, bottom bar on mobile showing Total (incl. tax) that expands to show Subtotal and Sales tax.

**Step 3: Preview and submit**

- Full request summary in formal document layout.
- **Edit** links per section that return to the relevant step.
- Explicit **Confirm submission** action.

**After submit: Confirmation screen**

- Success state with reference number, Total (incl. tax), timestamp.
- "A receipt has been sent to your email" only after the server confirms the email was queued; otherwise "Your request is saved. We'll email your receipt shortly."
- Remaining edits ("You can make 2 changes before it's reviewed").

A progress indicator must communicate where the user is in the process.

### Form usability requirements

- Use descriptive field labels rather than relying only on placeholders.
- Provide clear validation messages.
- Preserve entered values when moving between steps.
- Support keyboard navigation; Enter in the last item row adds a new row.
- Display a helpful explanation when no departments are available.
- Make the total easy to find without scrolling excessively.
- Prevent accidental removal of populated line items.
- Provide a confirmation before deleting a populated item.
- Make saving status visible ("Saved just now" / "Saving…" / "Not saved, retry").
- Use numeric keyboards on mobile for quantity and price.
- Help text under the price column: "Enter prices before tax. 12% sales tax is added to the total."
- No file upload or drag-and-drop area anywhere in the form.

### Shared department requests

Show who else represents the department ("Also editing: Sam Lee") on the request header, who made each version in the history, and the shared edit count ("1 of 2 edits left for this request").

### Edit submitted request

Same steps as creation, with a banner: "Editing submitted request. This uses 1 of your 2 remaining edits when you confirm." Cancelling uses nothing.

### Clarification response

Banner at the top showing the accountant's question. The requester edits and confirms through the same preview step. Banner text: "Responding to a clarification does not use one of your edits."

## 6.4 Financial summary component

The financial summary must show:

- Subtotal (before tax).
- Sales tax at the request's rate, e.g. "Sales tax (12%)".
- Final total, labeled "Total (incl. tax)".

The final total should be the strongest visual element in the summary.

Use consistent CAD formatting and clearly distinguish the final total from intermediate amounts.

Variants of the same component:

- **Requested** (form, preview, request details).
- **Requested vs Approved** (accountant review, approval confirmation, approval email): two columns plus a Difference row.
- **Budget vs Actual** (spending screens, My department budget): Available budget, Spent, Remaining, utilization bar.

The same component design must be reused in the form, preview, requester dashboard, accountant review, approval confirmation, spending screens, and email templates.

## 6.5 Preview screen

The preview should resemble a formal budget document.

It must contain:

- Requester.
- Department.
- Annual budget cycle.
- Request title.
- Justification.
- Itemized quantities and prices.
- Product links, where supplied.
- Subtotal.
- Sales tax.
- Total including tax.
- Final confirmation action.

The preview must be read-only. Editing should return the user to the relevant form step.

Submission must require an explicit confirmation.

## 6.6 Accountant dashboard

Prioritize financial oversight and review efficiency.

### Summary cards

- Departments expected to submit.
- Departments submitted.
- Outstanding departments.
- Requests awaiting review.
- Total requested (incl. tax).
- Total approved (incl. tax).

### Department completion table

Include:

- Department.
- Representative.
- Submission status.
- Requested amount.
- Approved amount.
- Outstanding action.
- Download (Excel) action per row.

### Review queue

Include:

- Request reference.
- Department.
- Requester.
- Submission date.
- Requested total.
- Status, with an "Updated" marker when a revision arrived since the accountant last viewed it.
- Available actions.

Use consistent status labels and allow filtering by cycle, department, and status.

The dashboard must distinguish drafts from actual submissions; drafts appear only as "Draft exists" in the department table, never in the review queue.

A link to the Spending dashboard shows overall spent and remaining for the cycle.

## 6.7 Accountant review screen

Present the request in a structured review layout.

Sections:

1. Request details.
2. Justification.
3. Requested line items.
4. Approved line-item values.
5. Requested-versus-approved comparison.
6. Accountant comments.
7. Revision history (with a side-by-side or highlighted diff between versions).
8. Decision controls.

Make the distinction between requested and approved values immediately apparent: approved columns are editable inputs with a distinct background; changed values show the requested value struck through beside them.

Decision controls, in order:

- **Approve as requested**.
- **Approve a different amount** (the main path): one input labelled **Approved total (incl. tax)**, a required note, and an optional **Board approval reference**. Under the input, live text shows the tax inside it: "Includes $3,214.29 sales tax (12%) on $26,785.71". The comparison shows Requested $44,800.00 → Approved $30,000.00, difference $14,800.00 less than requested.
- **Approve with line changes** (secondary, behind "Adjust individual items"): unlocks approved quantity, unit price, or line amount; the summary recalculates tax live.
- **Return for clarification** (secondary).
- **Decline** (danger style, never primary).

If the accountant represents the request's department, decision controls are replaced by: "You represent this department, so another approver must decide this request."

When second approval applies (above the threshold), the primary button reads **Approve (needs second sign-off)** and the status shows **Awaiting Second Approval** with who must sign off.

All consequential actions require explicit confirmation. The approval dialog shows requested total, approved total, and difference, all including tax.

On desktop the decision bar is sticky at the bottom of the review screen.

## 6.7a Board total and reopen (accountant)

- When a board-approved church total is set for the cycle, the Annual Budget dashboard shows a bar: **Allocated $140,000.00 of $150,000.00 board total · $10,000.00 left to allocate**. The approval dialog warns in Warning style if this approval would exceed it.
- Declined and Approved budgets show a secondary **Reopen** action (overflow menu, not the main bar) that asks for a reason and explains what reopening does.

## 6.7b Decision release (accountant)

On the Annual Budget dashboard, a **Decision emails** card:

- Mode toggle: **Send immediately** / **Hold and release on a date**.
- In Hold mode: date and time picker (shows time zone), optional shared message, a progress line ("Approved 9 · Declined 1 · Undecided 2 · Not submitted 1"), and actions **Preview emails**, **Release now**, **Change**, **Cancel schedule**.
- A banner on every review screen while holding: "Decisions are held until Dec 1, 9:00 a.m. Requesters won't see them before then."
- Release confirmation dialog: "Send 10 decision emails now?" with the list.
- Requesters in Hold mode see their status as **In Review** with "Decisions will be shared on Dec 1, 2026".

## 6.8 Finance assistant spending screen

The church administrator needs a clear operational view of approved budgets and actual spending.

### Spending dashboard

Totals for the cycle (available, spent, remaining, utilization), then for each department:

- Approved budget.
- Approved budget amendments.
- Total spent.
- Remaining amount.
- Spending utilization (bar with percentage text).
- Status badge.
- Last entry date.
- Recent spending entries (expand row or drill-down).

Use progress bars or compact charts to communicate utilization. Charts include an accessible table alternative.

Show warnings when a department approaches its approved budget limit (default 80%) or exceeds the available budget.

Warnings must include text and not rely only on red or amber colors.

Spending entries, refunds, voids, and amendments must use distinct labels and visual treatments:

| Type | Treatment |
|---|---|
| Expense | Default row |
| Refund | "Refund" label, undo icon, amount shown as `−$X` |
| Voided | "Voided" label, muted text, amount struck through, excluded from totals |
| Amendment | Shown in the department's budget summary, file-pen icon, not in the expense ledger |
| Unbudgeted | Warning badge "No approved budget" |

### Record spending form

- Department (shows available and remaining as soon as selected).
- Entry type: Expense / Refund (segmented control).
- Date, Payee/vendor, Description.
- Amount, labeled **"Amount paid (incl. tax)"**, with help text "Enter the total from the receipt. Tax is not added."
- Payment method, Receipt / invoice / cheque reference (text).
- Related approved item (optional searchable select).
- Notes.
- Live **before / after** remaining line: "Remaining: $19,100.00 → $14,100.00".
- If the entry goes over budget, the after-value turns Danger with "Over budget by $X", and a required **Overspend note** field appears.
- Duplicate warning inline if a matching entry exists.
- Primary action **Record spending**; **Record and add another** for batch entry.

### Correct and void

- Correct opens the same form with a required "Reason for correction".
- Void asks for a reason in a confirmation dialog explaining the entry will stay visible but no longer count.

### Locked period

When the accountant locks the cycle's spending period, show a lock banner and disable entry actions with the reason.

## 6.9 Budget amendment dialog (accountant)

- Increase / Reduction toggle, amount **including tax**, required reason, optional board reference.
- Live preview: tax portion inside the amount, and the new available budget.
- Warning if a reduction makes remaining negative.
- Confirmation states the requester will be emailed.

## 6.9a Expenses (Part B)

### New expense: type chooser

Two large, clear choices with one-line explanations:

- **Purchase request**: "Ask before you buy. Approved money is set aside for you."
- **Expense claim**: "Already bought something? Claim it here to be paid back or to record a church card purchase."

### Budget strip (both types)

At the top of the form, always visible: Department · Available $30,000.00 · Committed $1,008.00 · Spent $4,200.00 · Remaining $24,792.00, then after entering amounts: "Remaining after this: $23,784.00". Over budget turns the after-value Danger with "Over budget by $X" and reveals the required explanation field.

### Purchase request form

Same item rows and sticky financial summary as the annual budget form (unit price before tax, 12% tax added). Optional "From annual budget item" picker. **How will this be bought?** as three radio cards: Church administrator buys on the church account · I'll buy it and submit a claim · Supplier will invoice the church.

### Expense claim form

- Receipt lines: date, vendor, description, **Amount paid (incl. tax)**, receipt number. No tax line; the summary shows "Total paid".
- "Link to an approved purchase request" picker shows open requests with their committed amount.
- **Payee**: Me / Someone else (name, email) / Church card (nothing owed). Payment preference: cheque or e-transfer (email).
- **Receipts** (6B.9): drop zone on desktop, **Take photo** and **Choose file** on mobile; thumbnails with remove; progress and virus-scan state per file; "No receipt available" checkbox with reason.

### Preview and confirmation

Same formal preview pattern as the annual budget. Confirmation shows reference (EXP-…), status, and what happens next ("The accountant will review this. You'll get an email.").

### Expense review (accountant)

Split layout: details and lines on the left; receipts viewer (zoom, rotate, next/previous) and budget impact on the right. Decision bar: **Approve and send to Board Chair** · Approve a different amount (incl. tax) · Return · Decline.

An **approval tracker** at the top of every expense (requester, accountant, Board Chair, Church Administrator views) shows the steps: Submitted → Accountant ✓ → Board Chair ⏳ → Processing → Paid, with names and dates, so everyone sees where it is. Steps use icons and text, not colour alone.

### Board Chair review

Same split layout, read-only lines, with the accountant's approved amount and note highlighted at the top. Decision bar: **Give final approval** (primary) · Approve a smaller amount (incl. tax) · Return to accountant · Decline. Designed mobile-first, because the Board Chair will often approve from an email on a phone: the email's button opens straight to this screen after sign-in. Warnings for duplicates, late claims, and over budget appear above the decision bar with text and icons.

### Ready to process queue (Church Administrator / accountant)

Table: reference, type, payee, department, final approved amount, final approval date, days waiting, requester's payment preference, status (Approved / Processing). Row actions **Start processing** and **Record payment**. Totals waiting at the top.

### Record payment dialog

- **How it was paid** as a segmented list with icons: Cheque · Church card · Cash / petty cash · E-transfer · Supplier invoice (EFT) · Other.
- Fields change with the method:
  - Cheque: cheque number, **Signer 1** and **Signer 2** (pick from signing authorities; must be two different people).
  - Church card: card last 4 digits, transaction reference, purchased by.
  - Cash: received by, "Receipt signed" checkbox.
  - E-transfer: reference, recipient email.
  - Supplier invoice: invoice number, supplier.
- Date paid, amount paid (defaults to the approved amount; a difference reveals a required note).
- Confirm button reads with the amount: **Record $1,008.00 paid by cheque**.

### Status badges (expenses)

Pending states (Submitted, In Review, Awaiting Board Chair, Processing) = Information; Returned = Warning; Approved = Success; Paid, Purchased, and Closed = Success-neutral with check; Declined = Danger; Cancelled and Withdrawn = neutral.

### Budget views

Utilization bars become stacked: Spent (solid) + Committed (hatched) + Pending (outline), with a legend and text values, never colour alone.

## 6.10 Reports and Excel exports

Provide a clear export area with filters for:

- Budget cycle.
- Department.
- Status.
- Request date.
- Approval state.
- Report type: Annual budgets summary, Annual budget line items, Budget vs Actual, Spending ledger, Amendments, Expense submissions, Expense lines, Payments.

The interface should explain what is included in the export (sheets and columns) before downloading.

Show progress while generating large workbooks and provide a clear success or failure message.

Export controls must remain unavailable to unauthorized users; the Church Administrator sees only spending reports.

## 6.11 Administration screens

- **Users & Roles:** searchable table, role chips, department assignments, active toggle; confirmation for deactivation.
- **Departments:** list with active toggle, rename, and a **Leaders** column showing the Primary and up to two Backup requesters as chips ("Primary · Sam Lee", "Backup 1 · Ada Obi", "Backup 2 · Jo Lim") or a warning-tone "No backup" badge, with a filter for it. A department's page has **Make Primary**, **Make Backup 1**, **Make Backup 2** and **Make Representative** actions, and a **Planning Center** panel: source picker (Services team, Groups group or tag, custom field value) loaded from Planning Center, mode (Suggest / Automatic), "Team leaders count as Group Leaders" toggle, last sync time, **Sync now**, and the suggestions list with **Add as Primary / Backup 1 / Backup 2 / Representative** and **Ignore**. People no longer leaders in Planning Center show a "No longer a team leader" badge. Rename shows a history note: "Past requests keep the old name"; **Add departments** dialog with a paste-a-list option; a **Proposed** tab with a badge count, each row showing the typed name, who proposed it, the linked submission, close matches, and actions **Add to list**, **Merge into…**, **Reject** (reason required).
- **Budget cycles:** status (Draft / Open / Closed), deadline with **Change deadline** (date, reason, preview of who will be emailed), per-department **Extensions** list with **Give extension**, spending period end, lock state.
- **Signing authorities** (FR-53): table of name, email, active from, status; **Add signer**; **Remove** (date and optional reason, confirmation); warning banner when fewer than two are active.
- **Planning Center:** connection status and last sync; custom field picker and accepted values; **Test a person** search showing pass/fail with the reason; toggles for which roles require verification and which sign-in buttons appear; list of requesters failing verification.
- **Branding:** logo, church name, application name, accent color with live preview and contrast check (see 3.8).
- **Settings:** sales tax rate (with warning: "Changes apply to new submissions only"), near-limit threshold, accountant notification email, sender address, monthly summary toggle.
- **Notifications & Audit:** failed emails with retry, audit log with filters.

**Requester side (FR-38):** the department page shows "Primary: Sam Lee · Backup: Ada Obi". The Primary sees **Nominate a backup** (searchable list of verified Group Leaders) and an Away toggle; while Away, a neutral banner reads "Ada Obi is covering Media until Nov 3". Tasks that escalated show a small "Backup reminded" tag in My tasks.

## 6.11a Request messages panel

On request details (requester) and the review screen (accountant): a simple chronological thread with author, role, and time; a text box (2,000 characters, no attachments) and **Send**. A note under the box: "Sends an email to the accountant" (or "to the department's representatives"). Messages are not editable. Unread messages show a count on the request row and dashboard.

## 6.11b Account settings

Theme; email preferences (reminders, copies, accountant digest: instant or daily); accountants: Away toggle with dates and who is covering. Request and decision emails are listed as "always sent".

## 6.11c Help and privacy

Help page with short role guides and an FAQ (edits, tax, approvals, spending). Contextual "How is this calculated?" links open a side panel, not a new page. Privacy notice as a plain readable page.

## 6.13 Analytics & Audit dashboard (FR-52)

One page under **Reports → Analytics & Audit**, with three tabs: **Overview**, **Activity**, **Access** (administrator only). Desktop-first, fully usable on mobile.

**Layout**

- A sticky filter bar under the page title: Cycle, Department, Area, Date range, and **Reset**. Active filters show as removable chips. Filters live in the address (shareable, Back-button safe).
- Overview: a row of headline cards (4 per row on desktop, 2 on tablet, 1 on mobile) using the FinancialSummary styling for money (subtotal, tax, total rules from 3.7), each with a small trend indicator versus last year when available. Below, charts in cards on a 2-column grid (1 column on mobile).
- Each chart card has a title that states the takeaway ("Media has used 82% of its budget"), a **Chart / Table** toggle, **Export**, and a "Updated at" note when pre-computed.
- Clicking a bar, point or table row opens a side panel listing the items behind it; each item links to its page. **Esc** closes the panel and returns focus to the chart.

**Activity tab**

- A dense, readable table (date and time, person with role chip, action in plain language, item reference link, department, reason). Rows expand inline to a before/after comparison (two columns, changed values highlighted with both colour and a "changed" label).
- Quick view chips above the table: Today, Decisions this week, Money changes, Sign-ins and access, Settings and roles, Failed emails.
- Free-text search, event-group filter, person filter, and **Export to Excel**. Infinite scroll is not used; pages of 50 with page numbers so positions are stable.
- Area icons from 4.1 at the start of each row; status words use the 7.1 vocabulary.

**Access tab**

- Cards for failed sign-ins (24 h, 7 days), access denied attempts, suspended verifications, departments with no backup, mapping sync problems. Each card opens a filtered list with a fix-it link.

**Charts**

- One accessible chart style across the app: the categorical palette derived from the design tokens (3.2) with at least 3:1 contrast against the card, direct labels instead of legends where possible, patterns or labels so meaning never depends on colour alone, and a visible focus state on every data point reachable by keyboard (arrow keys move between points, Enter drills down).
- Money axes use en-CA CAD formatting; overspend is shown with the danger token and the word "over".
- Charts animate in once with the 5.2 Standard token and are static under reduced motion.

**States (11):** loading skeletons per card; empty state "No activity for these filters" with **Reset filters**; error state per card with **Retry**, so one failed chart does not blank the page; permission-denied view for tabs a role cannot see.

**Requester view:** the same page limited to their department: budget, committed, spent, remaining, their requests' timelines and activity. Payment details are hidden.

## 6.12 Print styles

The preview, request details, and approved request pages have a print stylesheet: light theme, no navigation, church name and reference number in the header, page numbers, totals block kept on one page. The accountant may print approved budgets for files.

---

# 7. Status, Notification, and Feedback Design

## 7.1 Status language

Use one consistent vocabulary, matching the PRD/SRS.

**Request status**

| Status | Plain-language explanation shown to requesters |
|---|---|
| Draft | Not submitted yet. Only you can see it. |
| Submitted | Sent to the accountant. You can still make changes (N left). |
| Updated | You changed it after submitting. The accountant will see the new version. |
| In Review | The accountant is reviewing it. |
| Returned for Clarification | The accountant has a question. Please respond. |
| Awaiting Second Approval | Approved by the accountant; waiting for final sign-off. |
| Approved | Approved. See the approved amount. |
| Declined | Not approved. See the reason. |
| Closed | The budget year has ended; read-only. |

**Department completion status** (accountant): Not Submitted, Draft Exists, Submitted, Updated, In Review, Returned for Clarification, Approved, Declined.

**Spending status:** On track, Nearing limit, Over budget, No approved budget.

**Spending entry status:** Recorded, Refund, Voided.

**Cycle status:** Draft, Open, Closed, Spending locked.

The interface must explain statuses in plain language when the next action is not obvious.

## 7.2 Status badges

Badges should be compact and consistent.

Each badge must include readable text and may include an icon.

Use semantic colors consistently across all screens: Approved and On track = Success; Returned, Nearing limit = Warning; Declined, Over budget = Danger; Submitted, Updated, In Review = Information; Draft, Closed, Voided = neutral.

Do not use animated pulsing badges for ordinary statuses.

## 7.3 Toast notifications

Use lightweight toast notifications for routine outcomes:

- Draft saved.
- Changes saved.
- Request submitted.
- Revision saved.
- Spending recorded.
- Excel export ready.
- Link copied.

Toasts should not cover critical controls or disappear so quickly that users cannot read them (minimum 5 seconds; paused on hover or focus).

Important failures must remain visible until resolved or explicitly dismissed.

Toasts are announced to screen readers via a polite live region; errors via an assertive one.

## 7.4 Confirmation dialogs

Require confirmation for consequential actions:

- Submit request.
- Confirm a revision (states how many edits remain after).
- Delete draft.
- Remove a populated budget item.
- Approve a budget.
- Return for clarification.
- Decline a budget.
- Record a budget amendment.
- Void a spending entry.
- Record spending that goes over budget.
- Lock or reopen a spending period.
- Change the sales tax rate.

Dialog copy must explain what will happen and whether the action is reversible. Buttons use verbs ("Approve $33,600.00", "Decline request"), not "OK".

Destructive actions must not be styled as ordinary primary actions.

## 7.5 Email design consistency

Email templates should share the application's visual identity.

Use:

- Clear subject lines, e.g. "Budget received: Youth Media FY2027 (IFC-2027-0007)".
- Church and application identity.
- Request reference number.
- Relevant financial summary (same Subtotal / Sales tax / Total layout).
- Plain-language status.
- Secure application link (button plus plain URL).
- Consistent typography and spacing.
- A plain-text version of every email.
- Single-column layout, 600 px max width, readable in dark-mode email clients.

Do not rely on color or images alone to communicate approval or decline.

Email set (see PRD/SRS FR-21 for recipients): submission receipt, new submission, revision, review started, clarification, clarification response, approval (as requested / with changes), awaiting second approval, second approval outcome, decline, reopened / extra edit, representative changed, new message, budget amendment, near-limit and over-budget alerts, monthly summary, cycle opened, deadline reminders, outstanding departments, cycle closed, delivery-failure digest, access request, role change.

Design one shared email layout with variable sections (status line, "what changed", "what you need to do", financial summary, button), rather than a separate design for each email. Each email's "what you need to do" line says "Nothing, this is for your records" when no action is needed.

---

# 8. Responsive Design Requirements

## 8.1 Desktop

Use a clear navigation structure, comfortable content widths (max ~1280 px for dashboards, ~800 px for forms), and appropriate space for tables and financial summaries.

## 8.2 Tablet

Adapt dashboards and review screens without making important controls difficult to reach.

Allow secondary panels to collapse when necessary.

## 8.3 Mobile

- Use stacked item cards instead of dense financial tables where appropriate.
- Keep important totals visible (sticky summary bar).
- Use large, touch-friendly controls (at least 44 × 44 px).
- Avoid horizontal scrolling for essential form interactions.
- Use mobile-appropriate dialogs (bottom sheets) and menus.
- Preserve all validation and confirmation steps.
- Keep the primary action easy to locate.
- Make sure the sticky summary and keyboard do not cover the focused input.

## 8.4 Responsive acceptance

Every major screen must be reviewed at 360 px, 768 px, 1024 px, and 1440 px widths.

No critical content may be clipped, overlapped, or obscured by fixed navigation.

---

# 9. Accessibility Requirements

Target WCAG 2.2 AA.

Required:

- Keyboard-accessible navigation and controls, including line-item reordering.
- Visible focus indicators that are not hidden by sticky headers or footers (WCAG 2.4.11).
- Proper form labels.
- Accessible names for icon-only buttons.
- Sufficient text and component contrast (see the tokens in 3.2).
- Screen-reader announcements for important status changes.
- Semantic tables and headings.
- Accessible dialogs and focus management.
- Error messages associated with relevant fields, plus an error summary at the top on submit.
- Reduced-motion support.
- No status communicated by color alone.
- Targets at least 24 × 24 px (WCAG 2.5.8); 44 × 44 px on mobile.
- No drag-only interactions (WCAG 2.5.7); reordering has buttons too.
- Text resizes to 200% without loss of content.

Accessibility testing must cover the actual implementation, not merely the design mockups, including one pass with a screen reader (VoiceOver or NVDA).

---

# 10. Design Tokens and Component Architecture

Build the interface using reusable components and centralized tokens.

Required token groups:

- Color.
- Typography.
- Spacing.
- Radius.
- Elevation.
- Borders.
- Motion duration.
- Motion easing.
- Focus rings.
- Breakpoints.
- Layering and overlay order.

Required shared components:

- Buttons.
- Inputs (including money input with CAD formatting).
- Select controls.
- Textareas (with character counter).
- Date controls.
- Dialogs.
- Dropdown menus.
- Tooltips.
- Toasts.
- Status badges.
- Data tables.
- Empty states.
- Loading skeletons.
- Progress indicators.
- Financial summaries (Requested, Requested vs Approved, Budget vs Actual variants).
- Utilization bar.
- Budget line-item rows.
- Spending entry rows.
- Revision history.
- Confirmation dialogs.
- Dashboard cards.
- Responsive navigation.
- Theme selector.
- Banners (info, warning, locked, clarification).

Every shared component must support its required visual, interaction, accessibility, and loading states.

Do not create separate implementations of the same component for different pages unless a documented variation is necessary.

Recommended implementation (matches the PRD/SRS stack suggestion): Tailwind CSS tokens + shadcn/ui (Radix primitives) + Lucide icons, with CSS transitions by default and Framer Motion only for list add/remove and dialogs.

---

# 11. Design and Engineering Collaboration

The design specification must map to actual application behavior.

For every interactive element, document:

- Purpose.
- Default appearance.
- Hover appearance.
- Focus appearance.
- Pressed appearance.
- Disabled appearance.
- Loading appearance.
- Success behavior.
- Error behavior.
- Responsive behavior.
- Keyboard behavior.
- Reduced-motion behavior.

For every data-dependent screen, define:

- Loading state.
- Empty state.
- Normal state.
- Partial-data state.
- Error state.
- Permission-denied state.
- Offline or network-failure behavior, where relevant.
- Session-expired behavior (see 11.1).

The frontend must not invent approval success, saved status, or email delivery. These states must reflect confirmed backend outcomes.

Animations must never replace server-side validation or financial calculations.

## 11.1 Session timeout

- Warn two minutes before the session expires, with **Stay signed in**.
- If the session expires during a form, keep the entered data locally, ask the user to sign in again, and restore the form afterwards.
- Never discard a draft because of a timeout.

## 11.2 Conflict handling

If someone else changed a record since it was opened (optimistic concurrency), show: "This was changed by [name] at [time]. Review the latest version before saving." with **View latest**. Never silently overwrite.

---

# 12. Performance Requirements

- Prefer CSS transitions for straightforward UI motion.
- Use JavaScript animation libraries only where they provide meaningful value.
- Avoid large animation dependencies for trivial transitions.
- Animate transform and opacity where practical.
- Avoid repeated layout recalculations.
- Prevent layout shifts during loading.
- Do not block input while decorative animation runs.
- Lazy-load nonessential illustrations.
- Respect reduced-motion preferences.
- Keep dashboard rendering responsive with realistic data volumes.
- Self-host the font with `font-display: swap`.

Motion must be tested on lower-powered mobile devices as well as desktop hardware.

---

# 13. Security and Data Integrity in the Interface

The interface must reinforce the application's security model.

- Hide controls the current user is not authorized to use.
- Enforce all permissions on the server regardless of interface visibility.
- Never expose another department's private request or spending to an unauthorized user.
- Require deliberate confirmation before consequential financial actions.
- Clearly distinguish requested amounts from approved amounts, and approved budget from spent.
- Show when a request is locked after approval.
- Explain when a requester has exhausted the two permitted edits.
- Explain that a clarification response does not use an edit.
- Clearly indicate when a budget cycle is closed or its spending period is locked.
- Do not offer file upload controls anywhere except the administrator's logo and receipts on expense claims.
- Treat externally supplied product links as untrusted input; show the domain beside each link and open in a new tab.
- Do not show success until the server confirms the underlying operation.
- Calculated amounts (line totals, tax, totals, remaining) are display-only, never editable inputs.

The visual design must never imply that a request is approved when it is only submitted or awaiting review.

---

# 14. Design Deliverables Before Development

The design phase must produce the following artifacts.

## 14.1 Product experience

- User journey maps.
- Requester workflow.
- Accountant workflow.
- Finance assistant workflow.
- Administrator workflow.
- Information architecture.
- Navigation map per role.
- Status and decision-state diagram.

## 14.2 Visual design

- Light-theme foundations.
- Dark-theme foundations.
- System-theme behavior.
- Typography scale.
- Color tokens with measured contrast.
- Spacing and layout system.
- Money formatting rules.
- Icon and emoji guidance.
- Component library.
- Responsive layouts.

## 14.3 Screen designs

High-fidelity designs for:

1. Google sign-in.
2. Access denied.
3. Requester dashboard (including My department budget panel).
4. Draft list.
5. Budget request details (step 1).
6. Itemized budget form with sticky financial summary (step 2).
7. Submission preview (step 3).
8. Submission confirmation.
9. Request revision.
10. Clarification response.
11. Request history.
12. Accountant dashboard.
13. Department completion report.
14. Accountant review.
15. Approve with changes (line-item and overall adjustment).
16. Approval confirmation.
17. Clarification workflow.
18. Decline workflow.
19. Finance assistant spending dashboard.
20. Record spending form, including over-budget state.
21. Spending ledger, correct and void.
22. Budget amendments.
23. Reports and exports.
24. Department administration.
25. User and role administration.
26. Annual budget cycle administration, including spending lock.
27. Settings (tax rate, threshold, email) and Branding (logo, name, accent color).
28. Notifications and audit.
29. Email templates (receipt, approval, clarification, decline, amendment, alerts).
30. Print layout for an approved request.
31. Request messages panel.
32. Account settings and email preferences.
33. Help and privacy notice.
34. Start from last year's budget.
35. Expense type chooser.
36. Purchase request form.
37. Expense claim form with receipt capture (desktop and phone camera).
38. Expense preview and confirmation.
39. Expense review with receipt viewer.
40. Ready to process queue and Record payment dialog (each payment method).
40a. Board Chair queue and review (mobile-first).
40b. Approval tracker component.
41. My expense submissions list.
42. Planning Center settings and access-denied variants.
43. Department selector with Other and duplicate suggestions.
44. Proposed departments admin queue.
45. Decision release card, schedule, and preview.
46. Department Leaders column, Primary/Backup actions, and nominate-a-backup dialog.
47. Planning Center mapping panel with suggestions.
48. Analytics & Audit: Overview, Activity (with expanded row), Access, and the drill-down side panel (desktop and mobile).
49. Global search results and breadcrumbs.

## 14.4 Interaction prototypes

Build interactive prototypes for:

- Creating a budget.
- Adding and removing line items.
- Automatic calculations including tax.
- Preview and submission.
- Editing a submitted request.
- Reviewing and approving a request, with and without changes.
- Returning a request for clarification and responding.
- Recording spending, including going over budget.
- Switching themes.
- Opening and closing dialogs.
- Responsive navigation.

## 14.5 Motion specification

Document:

- Motion tokens.
- Easing curves.
- Transition rules.
- Loading animations.
- Number transitions.
- Success feedback.
- Dialog and menu motion.
- Reduced-motion behavior.

## 14.6 Handoff documentation

Each design must include relevant dimensions, spacing, component states, responsive rules, interaction notes, accessibility requirements, and acceptance criteria.

---

# 15. Design Quality Assurance

Before release, verify that:

- All screens use the approved design tokens.
- Light, dark, and system themes behave correctly.
- Typography and spacing are consistent.
- All buttons and interactive elements have complete states.
- Loading, empty, error, and success states are designed.
- Motion is purposeful and consistent.
- Reduced-motion preferences are respected.
- Financial values remain readable during updates.
- Amounts are identical (to the cent) across screen, email, print, and Excel for the same request.
- The interface works across supported screen sizes.
- Keyboard and screen-reader interactions are usable.
- Statuses and approval decisions are unambiguous.
- No animation blocks an important user action.
- No unauthorized action is exposed or permitted.
- The original functional requirements remain intact.

Visual regression testing and end-to-end testing should be included in the development process.

---

# 16. Definition of Done

The application is design-complete when it feels like one coherent, polished product rather than a collection of unrelated pages.

Every screen has a clear purpose.

Every important number is understandable.

Every action communicates its state.

Every animation has a reason to exist.

Every error has a recovery path.

Every role has a coherent workflow.

Every financial decision remains traceable.

Every screen works on mobile and desktop.

Every accessibility requirement has been considered and tested.

The final experience must balance visual delight, operational efficiency, financial trust, accessibility, security, and maintainable engineering.

---

# 17. Final Design Direction

The Church Media Budget Submission Application should feel like a modern financial product with the warmth of a community organization.

Use refined typography, balanced whitespace, restrained colors, smooth motion, contextual emoji, helpful microcopy, elegant financial summaries, and predictable interactions.

Make the application feel alive without making it noisy.

**The standard is not maximum animation. It is maximum quality of experience.**

---

# 18. Design Decisions (confirmed)

| Topic | Decision |
|---|---|
| Branding | IFC logo and colours, changeable by the administrator (3.8); purple tokens are the default until set. |
| Language | English (Canada) only. |
| Confetti | Successful annual budget submission only; off with reduced motion. |
| Primary devices | Accountant and Church Administrator screens desktop-first; Board Chair approval and all requester flows mobile-first; everything works on both. |
| Areas | One application. Annual Budget, Expenses, Spending, Reports, and Admin are areas in the same navigation; Home shows My tasks across all roles. |
| Vice-Chair | Same screens as the Board Chair, labelled "Acting for the Board Chair" when covering. |
| Administrator | Sees everything; actions not permitted show "View only". |
| Department leaders | Primary and Backup 1 / Backup 2 requesters shown as chips; "No backup" is a warning, not an error. |
| Analytics | One dashboard with Overview, Activity and Access tabs; every chart has a table view and drill-down. |
| Navigation | Global search, breadcrumbs, and filters kept in the address. |

---

# Appendix A. Review Notes: What Changed from v1.0 to v1.1

| Area | v1.0 | v1.1 | Why |
|---|---|---|---|
| Light Success color | `#218653` (4.3:1 on background) | `#1C7A4A` (5.0:1) | Failed AA for text |
| Light Warning color | `#A8640A` (4.4:1 on background) | `#965A08` (5.2:1) | Failed AA for text |
| Input borders | Only `#E4E4EA` / `#292931` (≈1.3:1) | Added Border strong `#8A8A96` / `#6A6A78` (≥3:1) | Control boundaries need 3:1 |
| Dark primary button text | Not specified | `#08080A` on `#A78BFA` (7.4:1) | White on that purple is 2.7:1 |
| Form steps | 4 steps, summary as its own step | 3 steps + confirmation, sticky summary | Fewer clicks; total always visible; matches PRD/SRS |
| Unit price label | "Unit price" | "Unit price (before tax)" with help text | Prevents double taxation |
| Status vocabulary | 7 request statuses | Adds Updated, spending, entry, and cycle statuses | Matches PRD/SRS |
| Requester dashboard | No budget view | My department budget panel | Confirmed decision in PRD/SRS v1.2 |
| Accountant decisions | Approve / adjust | Approve as requested, Approve with changes, Return, Decline | Matches the "change just the amount" ask |
| Spending entry | Not specified | Full form with before/after remaining and overspend note | Core Church Administrator task |
| Navigation | Not specified | Per-role navigation table | Four roles with different jobs |
| Money format | Not specified | en-CA rules, words for negatives | Avoids ambiguous minus signs |
| Screens | 24 | 30 (access denied, clarification response, settings, audit, emails, print) | Gaps against PRD/SRS page list |
| Celebration | Included "ordinary approval" exclusion only | No confetti on approved-with-less | Approved may be less than requested |
| Emails | General guidance | Plain-text version, subject format, no emoji in subjects | Deliverability |
| Session and conflicts | Not specified | Timeout warning, data preserved; conflict message | Prevents lost work |
| Accessibility | WCAG 2.2 AA list | Adds 2.4.11, 2.5.7, 2.5.8 specifics | New in 2.2 |
| Print | Not specified | Print stylesheet for approved requests | Accountant filing |
