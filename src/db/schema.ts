import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import type { SettingsData } from '@/lib/settings-data'

// Money is integer cents everywhere. Hours are stored in hundredths, miles in
// tenths. Calendar dates are 'YYYY-MM-DD' strings in the business's time zone.

export type JobKind = 'service' | 'fabrication'
export type JobStatus = 'quote' | 'in_progress' | 'done' | 'paid'
export type JobLineType = 'labor' | 'part' | 'fee' | 'discount'
export type PaymentPurpose = 'deposit' | 'progress' | 'final' | 'refund'
export type PaymentMethod =
  | 'cash' | 'check' | 'venmo' | 'paypal' | 'zelle' | 'stripe' | 'card' | 'other'
export type AssetTreatment = 'undecided' | 'de_minimis' | 'section_179' | 'bonus' | 'macrs'
export type FileKind = 'receipt' | 'photo' | 'logo'
export type RequestStatus = 'sent' | 'paid' | 'void'

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const settings = pgTable('settings', {
  id: integer('id').primaryKey(),
  data: jsonb('data').$type<Partial<SettingsData>>().notNull(),
})

export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  notes: text('notes'),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: createdAt(),
})

export const vehicles = pgTable('vehicles', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  year: integer('year'),
  make: text('make'),
  model: text('model'),
  trim: text('trim'),
  vin: text('vin'),
  notes: text('notes'),
  createdAt: createdAt(),
}, (t) => [index('vehicles_customer_idx').on(t.customerId)])

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull(),
  seq: integer('seq').notNull(),
  customerId: integer('customer_id').notNull().references(() => customers.id),
  vehicleId: integer('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  kind: text('kind').$type<JobKind>().notNull().default('service'),
  status: text('status').$type<JobStatus>().notNull().default('in_progress'),
  openedOn: date('opened_on').notNull(),
  completedOn: date('completed_on'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('jobs_number_idx').on(t.year, t.seq),
  index('jobs_customer_idx').on(t.customerId),
])

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  // Schedule C line: '8'…'27a' for Part II expenses.
  scheduleLine: text('schedule_line').notNull(),
  // Built-in categories the app writes to on its own (payment fees).
  systemKey: text('system_key').unique(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const purchases = pgTable('purchases', {
  id: serial('id').primaryKey(),
  purchasedOn: date('purchased_on').notNull(),
  vendor: text('vendor').notNull(),
  method: text('method'),
  // Receipt-level tax and shipping, spread over the lines by amount.
  taxCents: integer('tax_cents').notNull().default(0),
  shippingCents: integer('shipping_cents').notNull().default(0),
  notes: text('notes'),
  createdAt: createdAt(),
}, (t) => [index('purchases_date_idx').on(t.purchasedOn)])

export const assets = pgTable('assets', {
  id: serial('id').primaryKey(),
  description: text('description').notNull(),
  placedInServiceOn: date('placed_in_service_on').notNull(),
  costCents: integer('cost_cents').notNull(),
  businessUsePct: integer('business_use_pct').notNull().default(100),
  treatment: text('treatment').$type<AssetTreatment>().notNull().default('undecided'),
  disposedOn: date('disposed_on'),
  notes: text('notes'),
  createdAt: createdAt(),
})

export const purchaseLines = pgTable('purchase_lines', {
  id: serial('id').primaryKey(),
  purchaseId: integer('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  description: text('description'),
  partNumber: text('part_number'),
  // In hundredths, so 2.5 ft of tubing is 250.
  quantityHundredths: integer('quantity_hundredths').notNull().default(100),
  // Line total, not unit price.
  amountCents: integer('amount_cents').notNull(),
  // Exactly one of jobId / categoryId / assetId / stock is set; none means it
  // still needs a home (e.g. its job was deleted).
  jobId: integer('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  categoryId: integer('category_id').references(() => categories.id),
  assetId: integer('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  // Bought for stock. What's been used is in stockUses; the line itself stays
  // as entered on the receipt.
  stock: boolean('stock').notNull().default(false),
  // Set for contract labor, for the 1099-NEC list.
  payee: text('payee'),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [
  index('purchase_lines_purchase_idx').on(t.purchaseId),
  index('purchase_lines_job_idx').on(t.jobId),
])

export const jobLines = pgTable('job_lines', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  type: text('type').$type<JobLineType>().notNull(),
  description: text('description').notNull(),
  hoursHundredths: integer('hours_hundredths'),
  rateCents: integer('rate_cents'),
  // What the customer is billed; negative for discounts.
  amountCents: integer('amount_cents').notNull(),
  // For parts: the purchase line that holds the cost.
  purchaseLineId: integer('purchase_line_id').references(() => purchaseLines.id, { onDelete: 'set null' }),
  // Parts not bought yet (quotes): the expected cost, which isn't a purchase
  // and counts nowhere until it's bought.
  estCostCents: integer('est_cost_cents'),
  partNumber: text('part_number'),
  quantityHundredths: integer('quantity_hundredths'),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [index('job_lines_job_idx').on(t.jobId)])

// Some of a stock line put on a job. Its cost counts on usedOn, not the
// purchase date. Deleting the job puts it back on the shelf.
export const stockUses = pgTable('stock_uses', {
  id: serial('id').primaryKey(),
  purchaseLineId: integer('purchase_line_id').notNull().references(() => purchaseLines.id, { onDelete: 'cascade' }),
  jobId: integer('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  quantityHundredths: integer('quantity_hundredths').notNull(),
  usedOn: date('used_on').notNull(),
  // The invoice line it's billed on, if any (one line can cover several uses).
  jobLineId: integer('job_line_id').references(() => jobLines.id, { onDelete: 'set null' }),
}, (t) => [
  index('stock_uses_line_idx').on(t.purchaseLineId),
  index('stock_uses_job_idx').on(t.jobId),
])

export const paymentRequests = pgTable('payment_requests', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  amountCents: integer('amount_cents').notNull(),
  purpose: text('purpose').$type<PaymentPurpose>().notNull(),
  description: text('description').notNull(),
  stripeInvoiceId: text('stripe_invoice_id').unique(),
  hostedUrl: text('hosted_url'),
  status: text('status').$type<RequestStatus>().notNull().default('sent'),
  createdAt: createdAt(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
})

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  // Null while a Stripe payment waits to be matched to a job.
  jobId: integer('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  receivedOn: date('received_on').notNull(),
  // Gross amount; negative for refunds.
  amountCents: integer('amount_cents').notNull(),
  purpose: text('purpose').$type<PaymentPurpose>().notNull(),
  method: text('method').$type<PaymentMethod>().notNull(),
  // Processor fee (Stripe, PayPal, Venmo business), a deductible expense.
  feeCents: integer('fee_cents').notNull().default(0),
  note: text('note'),
  payerName: text('payer_name'),
  stripeChargeId: text('stripe_charge_id').unique(),
  stripeRefundId: text('stripe_refund_id').unique(),
  stripeInvoiceId: text('stripe_invoice_id'),
  paymentRequestId: integer('payment_request_id').references(() => paymentRequests.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  index('payments_job_idx').on(t.jobId),
  index('payments_date_idx').on(t.receivedOn),
])

export const files = pgTable('files', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  kind: text('kind').$type<FileKind>().notNull(),
  purchaseId: integer('purchase_id').references(() => purchases.id, { onDelete: 'cascade' }),
  jobId: integer('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
})

export const trips = pgTable('trips', {
  id: serial('id').primaryKey(),
  tripOn: date('trip_on').notNull(),
  milesTenths: integer('miles_tenths').notNull(),
  purpose: text('purpose').notNull(),
  jobId: integer('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
})

export type TemplateLine = {
  type: JobLineType
  description: string
  hoursHundredths: number | null
  rateCents: number | null
  amountCents: number
}

export const jobTemplates = pgTable('job_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').$type<JobKind>().notNull(),
  title: text('title').notNull(),
  lines: jsonb('lines').$type<TemplateLine[]>().notNull(),
  createdAt: createdAt(),
})

export type Customer = typeof customers.$inferSelect
export type Vehicle = typeof vehicles.$inferSelect
export type Job = typeof jobs.$inferSelect
export type JobLine = typeof jobLines.$inferSelect
export type Purchase = typeof purchases.$inferSelect
export type PurchaseLine = typeof purchaseLines.$inferSelect
export type StockUse = typeof stockUses.$inferSelect
export type Category = typeof categories.$inferSelect
export type Asset = typeof assets.$inferSelect
export type Payment = typeof payments.$inferSelect
export type PaymentRequest = typeof paymentRequests.$inferSelect
export type FileRow = typeof files.$inferSelect
export type Trip = typeof trips.$inferSelect
export type JobTemplate = typeof jobTemplates.$inferSelect
