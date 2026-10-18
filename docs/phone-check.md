# Phone check (Stage 5)

A short script for checking the app on real phones before launch. Most of the phone layout is already tested automatically on every change: every page at 360 px, an emulated Pixel 7 with touch (`tests/e2e/phone.spec.ts`), and accessibility checks. What a computer can't check is how it feels on a real phone: the camera, the keyboard covering fields, Safari's quirks, and whether buttons are easy to hit with a thumb.

**Who:** one person with an **iPhone (Safari)** and one with an **Android phone (Chrome)**. About 30 minutes each.
**Where:** the staging site or the demo site ([demo-site.md](demo-site.md)), never the live site with real money. On the demo, use **Try the app as someone** to switch people.
**Record:** for each step, tick it, or write what went wrong with a screenshot (press the power and volume-up buttons together).

## 1. Everyone

- [ ] Open the site address. The sign-in page fits the screen with no sideways scrolling.
- [ ] Sign in. Home shows **My tasks** and **At a glance**, and the bar at the bottom has Home, Annual Budget, Expenses, Spending and More.
- [ ] Tap each item in the bottom bar. Each opens with one tap, and the one you're on is highlighted.
- [ ] Tap **More**. Every page you can open is listed by area. Tap one; the sheet closes and the page opens.
- [ ] Tap **Search**, type `EXP`, and tap a result.
- [ ] Turn the phone sideways and back. Nothing is cut off.
- [ ] In the account menu, switch the theme to **Dark** and back. Everything stays readable.
- [ ] Phone setting: make the text larger (iPhone: Settings → Display & Brightness → Text Size; Android: Settings → Display → Font size). The app's text grows and nothing overlaps.

## 2. Department leader (Sam Lee on the demo)

- [ ] **Annual Budget → My department's budget.** Open a draft or start one.
- [ ] Add three items. When you type a price, the keyboard shows numbers, and the field you're typing in isn't hidden behind the keyboard.
- [ ] The total bar at the bottom updates as you type. **Show breakdown** opens the Subtotal, Sales tax and Total.
- [ ] Leave the page and come back. The draft is still there ("Saved").
- [ ] **Expenses → New expense → Expense claim.** Under receipts, **Take photo** opens the camera. Take a photo of any receipt and it appears in the list. On an iPhone it's accepted (the app converts iPhone photos).
- [ ] Also add a receipt from your photo library, and a PDF from Files or Drive.
- [ ] **Preview**, then **Confirm submission**. The confirmation and reference number show.
- [ ] **Expenses → My expenses** shows the tracker for that expense.
- [ ] **Spending → My department's spending** shows the bar and the list of entries without sideways scrolling, apart from the table itself.

## 3. Board Chair (Cleo Chair on the demo)

These screens were designed for a phone.

- [ ] Open an expense from **Expenses → Awaiting my approval**, or from the link in an email on your phone (it asks you to sign in first).
- [ ] The amount, the accountant's note, the receipts and the department's remaining budget are readable without zooming.
- [ ] Tap a receipt. It opens, and you can zoom into the photo.
- [ ] **Approve** and confirm. The confirmation dialog's buttons are easy to hit and don't sit under the bottom bar.

## 4. Accountant (Accountant Pat on the demo)

- [ ] **Annual Budget → Review dashboard** and a budget's review screen. Choose **Approve a different amount**, type a total, and the tax inside it updates as you type.
- [ ] **Expenses → Review queue**, open one, **Return for clarification** with a question.

## 5. Church Administrator (on the demo, Gina Admin has every role)

- [ ] **Expenses → Ready to process**, open one, **Record payment**, choose **Cheque**. The signer lists and the date picker work on the phone.
- [ ] **Spending → Record spending.** Typing the amount shows Remaining before and after.

## 6. Reminder texts (once Twilio is set up)

- [ ] A reminder text arrives between 9:00 a.m. and 8:00 p.m. Its link opens the app in the phone's browser.
- [ ] Reply **STOP**. The next reminder comes by email only.

## When it's done

Note the phones and browser versions used, the date and any problems in `docs/decisions.md`. Problems become issues to fix before the pilot.
