# Shop jobs

Jobs, purchases, equipment and taxes for the shop. Replaces the yearly
Google Sheets. See `docs/PLAN.md` for the design.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no environment variables set, it runs
signed out with an embedded Postgres in `.data/pglite` and stores receipts
in `.data/uploads` (both gitignored). Delete `.data` to start over.

- `npm test`: unit and database tests (in-memory Postgres)
- `npm run typecheck`, `npm run lint`
- `npm run db:generate`: new migration after editing `src/db/schema.ts`
- `npm run db:migrate`: apply migrations to Neon (`DATABASE_URL`)

## Deploy (Vercel + Neon)

1. **Neon**: create a project (or a database in an existing one). Copy the
   pooled connection string.
2. **Vercel**: import the repo as a new project on your Pro team (Hobby is
   for non-commercial use).
3. **Blob**: in the Vercel project, Storage → create a Blob store with
   **private** access and connect it. That sets `BLOB_READ_WRITE_TOKEN`.
4. **Google sign-in**: in Google Cloud Console → APIs & Services →
   Credentials, create an OAuth client (Web application) with redirect URI
   `https://<your-domain>/api/auth/callback`.
5. **Environment variables** (Production):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon connection string |
   | `AUTH_SECRET` | a long random string (`openssl rand -base64 32`) |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | from step 4 |
   | `ALLOWED_EMAILS` | your Google address (comma-separate to add more) |
   | `CRON_SECRET` | another random string (nightly backup) |
   | `STRIPE_SECRET_KEY` | optional, see below |
   | `STRIPE_WEBHOOK_SECRET` | optional, see below |

6. Run the migrations once against Neon, then deploy:

   ```bash
   DATABASE_URL="postgres://…" npm run db:migrate
   ```

   Run it again whenever a change adds a file to `drizzle/`.

A production build refuses to serve pages until sign-in is configured.

## Stripe

1. In the Stripe dashboard, create a **restricted key** with write access to
   Customers, Invoices and Invoice items, and read access to Charges,
   Refunds, Balance transactions and Invoice payments. Set it as
   `STRIPE_SECRET_KEY`.
2. Add a webhook endpoint `https://<your-domain>/api/stripe/webhook` for
   `charge.succeeded`, `charge.updated`, `charge.refunded`,
   `invoice.voided` and `invoice.marked_uncollectible`. Set its signing
   secret as `STRIPE_WEBHOOK_SECRET`.
3. Customers need an email address before you can request a payment.

Requests from a job page become Stripe invoices (card or bank transfer).
Paid ones are recorded on the job automatically with the gross amount and
Stripe's fee. Payments from your website land in “Stripe payments to
match” on the home screen. Try it in Stripe test mode first, using a test
key and the Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`).

## Backups

- Neon keeps point-in-time history for undoing mistakes.
- A Vercel cron (`vercel.json`) writes every table as JSON to
  `backups/YYYY-MM-DD.json` in the Blob store each night.
- Settings → Export everything downloads a ZIP of CSVs and all receipts.
  Reports → Tax worksheet → “Receipts + CSVs” does the same for one year.
