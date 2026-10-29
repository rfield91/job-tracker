# Shop job tracker: plan

A small app to replace the yearly Google Drive folders, the per-job sheets
and the main jobs sheet. It tracks jobs, what was billed and paid, every
business purchase with its receipt, and the equipment bought each year, and
produces the numbers needed to file your own return.

## Goals

1. **Adding a job takes under 30 seconds.** Customer, car, a one-line
   description, done. Details get added as the job goes.
2. **Enter each number once.** Today a part is typed into the job sheet
   (cost), again into the jobs sheet (cost total), and the monthly tab is
   derived by hand. In the app, a part is entered once with its cost and
   billed price, and job profit, monthly profit, the invoice and the tax
   summary all come from that.
3. **Every business dollar has a home.** A purchase is either for a job
   (cost of parts), a shop expense in a tax category, or equipment. Nothing
   is "misc" by default.
4. **Tax time is copying numbers into tax software**, not a project. One
   screen lays out the year line by line the way Schedule C and the
   depreciation form ask for it, with every receipt attached.
5. **Works from the phone in the shop**, so a receipt gets photographed
   when it's in hand, not reconstructed from a card statement in April.
6. **Invoices and online payment come from the job**, so billing never
   means retyping the job somewhere else.

Not goals for v1: full accounting (balance sheet, bank reconciliation),
inventory counts, scheduling/calendar, payroll, customer portal.

## Tax basics the design follows

Assumes a sole proprietor or single-member LLC in New Hampshire, filing
federal Schedule C on the cash basis, self-prepared. This isn't tax
advice; the category list is worth checking against the Schedule C
instructions once.

- **Income is counted when paid, not when billed.** Payments are recorded
  with dates; reports use those dates. "Billed" is kept for job profit and
  for chasing unpaid work.
- **Gross, not net.** A Stripe payment is income at its full amount, and
  Stripe's fee is a separate expense. Recording the net payout instead
  would under-report income and won't match the 1099-K Stripe sends.
- **Parts bought for and resold on a customer job are cost of goods
  sold** (Schedule C Part III), not an expense. Tools, shop supplies,
  welding gas, software, insurance, etc. go on their own expense lines.
- **Consumables** (brake clean, rags, welding gas and wire, discs) are
  shop supplies when bought. **Materials bought ahead** (tubing, bends,
  flanges) are stock: a purchase line marked stock. Using some records a
  stock use (job, quantity, date); the purchase line stays as entered and
  its cost is shared by quantity. The same part number bought on different
  receipts is one stock item, used oldest first. Stock costs count on the
  day they're used,
  and the tax worksheet reports what's on the shelf at each year end as
  beginning and ending inventory (Part III lines 35 and 41).
- **Equipment** (this year: lathe, bandsaw, welder) is tracked as assets,
  not expenses: description, date placed in service, cost, and business-use
  percentage. Tax software asks for exactly these and then offers the
  choices (de minimis expensing, Section 179, bonus or regular
  depreciation). The app records which choice was made each year; it
  doesn't compute depreciation.
- **Business-use percentage matters** because shop tools may also work on
  your own race car. Anything used for both gets a percentage; purely
  personal purchases don't belong in the app at all.
- **No sales tax** in NH, so the app has no sales tax handling.
- **NH Business Profits Tax** applies above a gross business income filing
  threshold. The year summary shows gross business income so it can be
  checked against the current threshold.
- **Subcontractors** (paint, machining, a helper) are tracked as
  contract labor with the payee, so the year-end report lists who may need
  a 1099-NEC (check the current IRS threshold).
- **Vehicle use** for parts runs: an optional mileage log (date, miles,
  purpose, job). Schedule C Part IV asks for business miles; the deduction
  uses the standard mileage rate, set per year.
- **Records**: receipt photos are stored with each purchase and kept for at
  least seven years, with a full export so the data never depends on the
  app existing.

## How it works for you

### The main screen

```
┌───────────────────────────────────────────────────────────┐
│  [+ Job]   [+ Purchase]   [+ Payment]        🔍 search    │
├───────────────────────────────────────────────────────────┤
│  October       Paid $6,420   Costs $2,910   Profit $3,510 │
│  Unpaid       $1,850 on 3 jobs                            │
│  Stripe       1 payment to match  ▸                       │
├───────────────────────────────────────────────────────────┤
│  In progress                                              │
│   051  Mike R.   '08 WRX       Catback exhaust   $300 dep │
│   053  Dana K.   '19 Civic Si  Brakes + fluid             │
│  Waiting on payment                                       │
│   048  Tom S.    '02 Miata     Splitter + diffuser  $650  │
│  Done this month (12)  ▸                                  │
└───────────────────────────────────────────────────────────┘
```

Three buttons cover almost everything: start a job, log a purchase, record
a payment. Search finds jobs by customer, car, job number or description.

### A job

```
#051  Mike R. — 2008 Subaru WRX            [In progress ▾]
Catback exhaust, 3" SS, resonated

Labor                             hrs   rate    billed
  Fabrication                     6.0    $95     $570
  Install                         1.5    $95     $143
Parts                         cost  billed   from
  3" 304 tubing 10ft          $142    $185   Purchase 10/12 ✓
  Vibrant resonator           $118    $150   Purchase 10/12 ✓
  Hangers, clamps            (shop supplies — not billed)
Fees / discount                             -$50

Billed $998    Cost $260    Profit $738

Payments                                      [+ Payment]
  10/10  Deposit   Stripe   $300   (fee $9.00)
                                  Balance due  $698
[Print invoice]  [Request payment ▾]  Notes · Photos (4)
```

- **Add a part** from inside the job: description, cost, billed price
  (pre-filled from a default markup, editable), and optionally snap the
  receipt. That one entry creates the purchase record and the invoice line.
- **Add labor**: hours × rate (default rate from settings) or a flat price.
- **Status** is one dropdown: Quote → In progress → Done → Paid. "Waiting
  on payment" is derived (done, balance due), not a status to maintain.
  Paid is set automatically when the balance reaches zero.
- **Templates** for repeat work: "Oil change", "Brake job", "Alignment",
  "Catback build" pre-fill the usual labor lines and parts.

### Payments

A job can have any number of payments, each with a **purpose**:

- **Deposit**: taken before work or parts orders start.
- **Progress**: mid-job payments on long fabrication work.
- **Final**: the balance.
- **Refund**: money returned (a negative payment).

Each payment has a date, amount, method (cash, check, Venmo, Zelle,
Stripe), and an optional note. The job shows the list, the total paid and
the balance due, and the invoice prints them the same way. Deposits are
income in the year they're received, even if the job finishes the next
year, and the reports follow that.

### A purchase

From the phone: tap **+ Purchase**, take a photo of the receipt, enter
vendor (autocompletes), date (defaults to today) and total. Then one
question: **what was it for?**

- **A job** → pick it (recent active jobs are listed first). It becomes
  cost of goods for that job, and you set a billed price if it's a part
  you'll charge for.
- **The shop** → pick a category (tools, shop supplies, welding gas,
  software, etc.). The last category used for that vendor is pre-selected.
- **Equipment** → it goes on the asset list with its business-use
  percentage. The app suggests this for single items over $2,500.
- **Split** → for a receipt that covers two jobs plus shop stuff, add a
  line per piece. Uncommon, so it stays one tap away instead of being in
  the default form.

Returns and refunds are a purchase with a negative amount against the same
job or category.

### Invoices and Stripe

**Printable invoices and estimates come from the app.** The job is the
invoice: its number, customer and car, labor and parts lines (billed
prices only, never costs), payments received and balance due. A job in
Quote status prints as an estimate. Your business name, logo, address and
payment instructions come from settings. Print or save as PDF from the
browser.

**Stripe works as the online payment channel, not the place invoices are
written.** If the invoice were built in Stripe, every job would be entered
twice and Stripe's copy would drift from the app's. Instead:

- **Request payment** on a job sends a Stripe invoice for the amount you
  choose: a deposit, a progress payment, or the balance. The app creates
  the Stripe customer (once per customer), adds the job's lines (or a
  single "Deposit for job #051" line), and Stripe emails it with a hosted
  payment page. Card and ACH bank payments both work there.
- **Payments arrive on their own.** A Stripe webhook records each paid
  invoice as a payment on its job, with the gross amount as income and
  Stripe's fee as an expense under "Fees and bank charges". Nothing to
  type when a customer pays.
- **Payments from your website** that weren't requested through the app
  (a checkout or payment link) land in a "Stripe payments to match" list
  on the main screen; one tap assigns each to a job.
- **Cash, check, Venmo and Zelle** are still recorded by hand, and the
  printed invoice can list those as alternatives.
- **The year summary reconciles with Stripe's 1099-K**: total gross Stripe
  payments for the year are shown on their own line.

Things to know about Stripe for this:

- Fees: card payments cost about 2.9% + 30¢, ACH bank payments about 0.8%
  (capped at $5), and Stripe Invoicing adds a small percentage per paid
  invoice. Check current pricing. For a $2,000 fabrication job, offering
  ACH saves real money, so the invoice can point that out.
- Stripe's own invoice PDF exists too, but it only shows what that one
  request covered. The app's printed invoice stays the full record of the
  job.
- The app uses a restricted Stripe API key (customers, invoices and
  webhooks only), kept in a server-side environment variable, and verifies
  webhook signatures.

### Reports

- **By month**: revenue (paid), cost of goods, expenses, profit. This
  replaces the monthly tab.
- **Jobs**: every job with billed, cost, profit, margin and balance;
  filter by year, status, customer, service vs fabrication. Replaces the
  jobs sheet.
- **Tax year worksheet**, laid out for entering into tax software:
  - Schedule C income: gross receipts, with Stripe's 1099-K total alongside
  - Part III cost of goods sold (purchases for jobs, contract labor on jobs)
  - Part II expenses, one row per Schedule C line, each tappable down to
    the purchases behind it
  - Part IV vehicle: business miles, from the mileage log
  - Assets placed in service this year (for the depreciation form):
    description, date, cost, business-use %, and the method you chose
  - Contract labor by payee, for 1099-NEC checks
  - Gross business income, for the NH BPT threshold check

  Export as PDF and CSV, plus a ZIP of all receipts named by date and
  vendor.
- **Tax estimate:** on the tax worksheet, self-employment tax plus the
  federal income tax the business adds on top of the household's other
  income (filing status and other income by year in settings), after half
  of SE tax, the standard deduction, the QBI deduction and expensed
  equipment. Shows whether the NH BPT/BET thresholds are crossed. Tax
  tables live in `src/lib/tax-estimate.ts` and need adding each year.
- **Quarterly estimate helper:** profit by quarter and a suggested
  set-aside (what each quarter adds to the year's estimated tax, or a flat
  percentage for years without tax tables), with the federal estimated
  payment due dates.

## Data model

Money is stored as integer cents; dates as local calendar dates.

- **Customer**: name, phone, email, notes, Stripe customer id.
- **Vehicle**: customer, year, make, model, trim, VIN (optional), notes.
- **Job**: number (`2026-051`), customer, vehicle, title, kind
  (service / fabrication), status, opened / completed dates, notes,
  photos.
- **JobLine**: job, type (labor / part / fee / discount), description,
  hours and rate *or* amount, billed amount, and for parts a link to the
  PurchaseLine that holds its cost.
- **Payment**: job (empty while unmatched), date, amount, purpose
  (deposit / progress / final / refund), method, note, Stripe invoice and
  payment ids, Stripe fee.
- **PaymentRequest**: job, amount, purpose, Stripe invoice id, status
  (sent / paid / void), sent date.
- **Purchase**: date, vendor, payment method, total, tax, shipping,
  receipt images, notes.
- **PurchaseLine**: purchase, amount, and one of a job (cost of goods), a
  category (expense) or an asset; payee for contract labor.
- **Asset**: description, purchase line (when bought through the app),
  date placed in service, cost, business-use %, tax treatment chosen
  (de minimis / Section 179 / bonus / regular) and the year it was filed,
  disposed date.
- **Category**: name, Schedule C line, active. Seeded with a default list
  (shop supplies, tools under the asset threshold, welding gas and
  consumables, contract labor, car and truck, insurance, rent / utilities,
  software and subscriptions, advertising, fees and bank charges, office,
  education, other).
- **Trip** (mileage): date, miles, purpose, job (optional).
- **Settings**: business name, logo, address, invoice footer and payment
  instructions, labor rate, default parts markup, mileage rate per year,
  job number format, asset suggestion threshold.

Shipping and tax on a receipt are spread across its lines in proportion
to amount, so a job's cost includes them.

## Tech approach

**An installable web app (PWA)** that works on the phone and on a desktop
browser, hosted on Vercel with the database on Neon, alongside your other
apps. A desktop-only app can't take receipt photos in the shop, and a
phone-only app is painful for reports and data cleanup.

- **Framework**: Next.js (App Router) + TypeScript + Tailwind on Vercel.
  It keeps the pages, the API, the Stripe webhook and the nightly backup
  job in one project, which is the simplest setup on Vercel.
- **Database**: Neon Postgres through Drizzle ORM (typed schema,
  migrations in the repo) and Neon's serverless driver. Use a Neon branch
  for development so test data never touches the real books.
- **Receipt and job photos**: Vercel Blob. Photos are resized on the phone
  before upload (a receipt is legible at ~300 KB), which keeps storage
  small for years of records.
- **Sign-in**: Auth.js with Google sign-in, allowed for your account only.
  The Stripe webhook route is the one public endpoint, protected by
  Stripe's signature check.
- **Stripe**: the official `stripe` Node library, server-side only.
- **Backups**: Neon's point-in-time restore covers mistakes; on top of
  that a nightly Vercel Cron job writes a full export to Blob, and an
  "Export everything" button in settings downloads CSV per table plus a
  receipts ZIP.
- **Offline**: not in v1. Unsaved forms are kept on the device so a lost
  signal doesn't lose an entry.
- **Plan note**: Vercel's free Hobby plan is meant for non-commercial use,
  so this app should live on a Pro team (if your other apps are already on
  one, it costs nothing extra). Neon's free tier is plenty for this data.

## Moving off the spreadsheets

Since it's late in the year, two options:

1. **Import 2026** so this year's tax worksheet comes from the app. Export
   the main jobs sheet and the big-ticket items sheet to CSV. Jobs import at
   summary level (customer, car, description, billed, cost, paid date);
   the per-job sheets stay in Drive as the backup record. The lathe,
   bandsaw and welder import as assets with their dates and costs (you'd
   add the business-use % for each). Other 2026 business expenses need
   entering or importing from wherever they're tracked.
2. **Start clean on January 1, 2027**, finish 2026 in Sheets, and use the
   remaining weeks to try the app on new jobs. The 2026 assets still get
   imported, since they carry into future years (depreciation and if
   they're ever sold).

Option 1 is recommended if most 2026 business expenses are already listed
somewhere; otherwise option 2 avoids a rushed cleanup in December.

## Milestones

- **M0: foundation.** Repo, Next.js app on Vercel, Neon database and
  Drizzle migrations, Google sign-in, settings page.
- **M1: jobs and payments.** Customers, vehicles, jobs, labor and part
  lines, payments with purposes, the main screen and job page, search.
  Usable on its own as a replacement for the jobs sheet.
- **M2: purchases and assets.** Receipt capture and storage, vendor
  autocomplete, job / category / equipment assignment, splits, refunds,
  parts created from inside a job, the asset list.
- **M3: invoices and reports.** Printable invoices and estimates, monthly
  and jobs reports, the tax year worksheet, PDF/CSV/receipt ZIP exports,
  full backup export and nightly backup.
- **M4: import.** CSV import for the 2026 jobs sheet and the big-ticket
  items sheet (and purchases if available), with a preview before anything
  is saved.
- **M5: Stripe.** Request payment (deposit, progress or balance) as a
  Stripe invoice, webhook-recorded payments and fees, matching website
  payments, 1099-K reconciliation line.
- **M6: speed and extras.** Job templates, mileage log, contract
  labor/1099 list, quarterly set-aside helper, receipt reading
  (vendor/date/total filled in from the photo).

## Status

M0–M5 are built, plus templates, the mileage log, the 1099 list and the
quarterly set-aside helper from M6, and stock with part numbers and
quantities on purchase lines. Deployment needs the accounts and keys
listed in the README. Not built yet: reading vendor/date/total from receipt
photos (needs an Anthropic API key), and the importer hasn’t been tried
against the real jobs and big-ticket sheets.

## Open questions

1. Non-job purchases aren’t tracked well today, so 2026 expenses will need
   entering by hand (or importing from bank/card CSVs) if this year’s taxes
   come from the app.
2. Website payments come through Stripe; job payments are PayPal, Venmo,
   cash, check and Zelle. The importer maps any of those.
