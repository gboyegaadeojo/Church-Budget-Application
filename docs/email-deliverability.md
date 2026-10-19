# Email deliverability test (Stage 5)

Email is how people learn that a budget needs a decision, an expense was approved or a payment was made. If the app's emails land in spam, approvals stall. This test checks, before the pilot, that they reach the inbox at the main mail providers.

**Who:** someone who can sign in to the church's Resend account, and someone who can change the church domain's DNS (often the same person, or whoever looks after the church website). The System Administrator sends the test emails.
**When:** on the staging site before the pilot, then once more on the live site before the cycle opens (go-live checklist, launch step 3). About 45 minutes.
**What the app already does for you:** every email has a plain-text version beside the HTML, one shared layout, no emoji in subjects, no tracking pixels, and links with nothing in the query string. Sign-in codes expire after 10 minutes and their bodies are cleared once sent.

## 1. Check the domain in Resend (10 minutes)

The church's Resend account sends for one verified domain (the free plan allows one), which the church's other apps already use.

- [ ] In Resend → **Domains**, the domain in `RESEND_FROM` shows **Verified**. Resend's records are its own: an SPF record (TXT) and an MX record on the `send.` subdomain, and a DKIM record (TXT) at `resend._domainkey`. They don't affect the church's normal email.
- [ ] `RESEND_FROM` in Netlify is on that domain and includes a name, for example `IFC Budget <budget@<church-domain>>`. An address on a different domain from the verified one is refused by Resend.
- [ ] The domain has a **DMARC** record. Look it up at a free checker such as mxtoolbox.com → DMARC Lookup. If there is none, add a TXT record named `_dmarc` with the value `v=DMARC1; p=none; rua=mailto:<someone>@<church-domain>`. If one already exists, leave it alone: it covers the church's other email too.
- [ ] On the domain's page in Resend, **click tracking** and **open tracking** are off. Click tracking rewrites every link through Resend's address, which spam filters distrust and which hides that the link goes to the app.
- [ ] Note what the church's other Resend apps send in a busy week. The free plan's **100 emails a day and 3,000 a month** are shared. The app's busiest day is when a cycle opens: one email to every leader of every active department. Admin → Departments shows how many leaders that is.

## 2. Send test emails from the app (15 minutes)

Admin → **Notifications & Audit** → **Send a test email**. It goes through the outbox and the shared layout exactly like a real email. The app allows 20 test emails a day.

Send one to each of these, and ask the owner of each mailbox to check where it landed:

| Mailbox | Address used | Inbox, spam or other tab | SPF / DKIM / DMARC pass |
|---|---|---|---|
| Gmail (personal) | | | |
| Outlook.com or Hotmail | | | |
| Apple iCloud (`@icloud.com` or `@me.com`) | | | |
| The church's own domain | | | |
| A volunteer's other provider (for example Shaw, Telus or Yahoo) | | | |

- [ ] Each test email shows **Sent** in the email log below the form. A **Couldn't be sent** row shows Resend's reason (most often the API key or the From domain).
- [ ] **Gmail:** open the email → ⋮ → **Show original**. SPF, DKIM and DMARC all read **PASS**. A landing in the Promotions or Updates tab is fine; spam is not.
- [ ] **Outlook.com:** open the email → … → **View** → **View message source**. `Authentication-Results` shows `spf=pass`, `dkim=pass` and `dmarc=pass`. Check both Inbox and Other if Focused Inbox is on.
- [ ] **Apple Mail / iCloud:** it is in the Inbox, not Junk.

## 3. Get a spam score (5 minutes)

- [ ] Go to **mail-tester.com** (free, a few tests a day). Copy the address it shows, send a test email to it from the app, then click **Then check your score**.
- [ ] The score is **9/10 or better**. The report says what any lost points are for; fix those first (most are about DNS records in section 1).

## 4. Check a real email (15 minutes)

A real email has amounts, a status and a button, unlike the test email. On staging:

- [ ] A department leader submits a small budget. Their receipt arrives in the inbox and shows **Subtotal**, **Sales tax** and **Total (incl. tax)**.
- [ ] Open the receipt on a phone, in light and in dark mode. Everything is readable and nothing is cut off.
- [ ] Tap **View request**. It opens the app's sign-in page, then the request. The link has no budget details in it.
- [ ] The church's logo shows, if a PNG or JPEG logo is set in Branding (mail apps don't show SVG logos).
- [ ] **Decide what happens to replies.** They go to the From address. Either have that address forward to the church office, or accept that nobody reads them: every email sends people back to the app, where messages on a request are kept with it.

## If emails land in spam

1. **DNS first:** in Gmail's Show original, any check that isn't PASS points to the record to fix in section 1. The DNS change can take up to a day to reach every provider; send the test again after that.
2. **A new From address:** mail providers trust a new address slowly. Send a handful of real emails over a few days (the pilot does this) rather than everything at once.
3. **Ask people to help:** each person who finds an app email in spam marks it **Not spam** and adds the From address to their contacts. Providers learn from that.
4. **Outlook.com and Hotmail** are the strictest. If they still send it to Junk once everything passes, record it in the pilot notes. Microsoft's sender support form (sender.office.com) handles delistings.
5. **Still stuck:** check Resend → **Emails** for bounces and complaints on recent sends, and look at Resend's deliverability insights for the domain.

## Results

Record the date, who ran it, the mail-tester score and anything that went wrong in `docs/decisions.md` under a "Deliverability test" heading. Then tick launch step 3 in the [go-live checklist](go-live-checklist.md).
