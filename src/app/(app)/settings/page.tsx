import { asc } from 'drizzle-orm'
import { Trash2 } from 'lucide-react'
import { ActionButton, ActionForm, SubmitButton } from '@/components/forms'
import { Badge, Card, CardHeader, Field, Input, MoneyInput, PageHeader, Select, Textarea } from '@/components/ui'
import { saveCategoryAction, saveSettingsAction } from '@/app/actions/misc'
import { deleteTemplateAction } from '@/app/actions/jobs'
import { jobTemplates } from '@/db/schema'
import { EXPENSE_LINES } from '@/lib/schedule-c'
import { centsToInput } from '@/lib/money'
import { FILING_STATUS_LABELS } from '@/lib/tax-estimate'
import { authMode } from '@/lib/auth'
import { authedDb } from '@/server/session'
import { listCategories } from '@/server/purchases'
import { getSettings, today } from '@/server/settings'
import { stripeEnabled } from '@/server/stripe'
import { ExportButtons } from './export-buttons'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const db = await authedDb()
  const s = await getSettings(db)
  const cats = await listCategories(db)
  const templates = await db.select().from(jobTemplates).orderBy(asc(jobTemplates.name))
  const thisYear = Number((await today(db)).slice(0, 4))
  const rateYears = [...new Set([...Object.keys(s.mileageRates), String(thisYear)])].sort().reverse()
  const incomeYears = [...new Set([...Object.keys(s.otherIncome), String(thisYear), String(thisYear - 1)])].sort().reverse()
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Settings" />
      <ActionForm action={saveSettingsAction} className="space-y-4">
        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold">Business (shown on invoices)</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name"><Input name="businessName" defaultValue={s.businessName} /></Field>
            <Field label="Your name"><Input name="ownerName" defaultValue={s.ownerName} /></Field>
            <Field label="Phone"><Input name="phone" defaultValue={s.phone} /></Field>
            <Field label="Email"><Input name="email" type="email" defaultValue={s.email} /></Field>
            <Field label="Website"><Input name="website" defaultValue={s.website} /></Field>
            <Field label="Logo">
              <input type="file" name="logo" accept="image/*" className="text-sm" />
              {s.logoFileId && (
                <label className="mt-1 flex items-center gap-2 text-xs text-fg-muted"><input type="checkbox" name="removeLogo" value="1" /> Remove current logo</label>
              )}
            </Field>
            <Field label="Address" className="sm:col-span-2"><Textarea name="address" defaultValue={s.address} rows={2} /></Field>
            <Field label="How to pay (printed on invoices)" className="sm:col-span-2"
              hint="e.g. Venmo @yourshop · Zelle you@email.com · Checks payable to …">
              <Textarea name="paymentInstructions" defaultValue={s.paymentInstructions} rows={2} />
            </Field>
            <Field label="Invoice footer" className="sm:col-span-2"><Input name="invoiceFooter" defaultValue={s.invoiceFooter} /></Field>
          </div>
        </Card>
        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold">Defaults</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Labor rate"><MoneyInput name="laborRate" defaultValue={centsToInput(s.laborRateCents)} /></Field>
            <Field label="Parts markup %"><Input name="partsMarkupPct" defaultValue={s.partsMarkupPct} inputMode="decimal" /></Field>
            <Field label="Invoice due in (days)"><Input name="invoiceDueDays" defaultValue={s.invoiceDueDays} inputMode="numeric" /></Field>
            <Field label="Equipment above" hint="De minimis safe harbor limit"><MoneyInput name="assetThreshold" defaultValue={centsToInput(s.assetThresholdCents)} /></Field>
            <Field label="1099-NEC flag at" hint="Check the current IRS threshold"><MoneyInput name="contractorThreshold" defaultValue={centsToInput(s.contractorThresholdCents)} /></Field>
            <Field label="Time zone"><Input name="timezone" defaultValue={s.timezone} /></Field>
          </div>
        </Card>
        <Card className="p-4">
          <div className="mb-1 text-sm font-semibold">Tax estimate</div>
          <div className="mb-3 text-xs text-fg-subtle">
            The business’s profit is taxed on top of the rest of your household’s income, so the estimate needs both.
            Other income is everything on your return that isn’t this business, before deductions: wages, a spouse’s pay, interest.
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Filing status" className="col-span-2">
              <Select name="filingStatus" defaultValue={s.filingStatus}>
                {Object.entries(FILING_STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            {incomeYears.map((y) => (
              <Field key={y} label={`Other income ${y}`}><MoneyInput name={`otherIncome_${y}`} defaultValue={s.otherIncome[y] != null ? centsToInput(s.otherIncome[y]) : ''} /></Field>
            ))}
            <Field label="Set-aside %" hint="For years without tax tables"><Input name="setAsidePct" defaultValue={s.setAsidePct} inputMode="decimal" /></Field>
          </div>
        </Card>
        <Card className="p-4">
          <div className="mb-1 text-sm font-semibold">Standard mileage rate</div>
          <div className="mb-3 text-xs text-fg-subtle">Cents per mile, from the IRS for each tax year.</div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {rateYears.map((y) => (
              <Field key={y} label={y}><Input name={`mileage_${y}`} defaultValue={s.mileageRates[y] ?? ''} inputMode="decimal" placeholder="¢/mi" /></Field>
            ))}
            <Field label="Other year">
              <div className="flex gap-1">
                <Input name="mileage_new_year" placeholder="Year" inputMode="numeric" />
                <Input name="mileage_new_rate" placeholder="¢" inputMode="decimal" />
              </div>
            </Field>
          </div>
        </Card>
        <div className="flex justify-end"><SubmitButton>Save settings</SubmitButton></div>
      </ActionForm>

      <Card>
        <CardHeader title="Expense categories" />
        <div className="px-4 pb-2 text-xs text-fg-subtle">Each maps to a Schedule C line. “Payment processing fees” collects Stripe, PayPal and Venmo fees automatically.</div>
        <div className="divide-y divide-line border-t border-line">
          {cats.map((c) => (
            <ActionForm key={c.id} action={saveCategoryAction} className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2 sm:grid-cols-[1fr_16rem_6rem_auto]">
              <input type="hidden" name="id" value={c.id} />
              <Input name="name" defaultValue={c.name} />
              <Select name="scheduleLine" defaultValue={c.scheduleLine} className="col-span-2 sm:col-span-1">
                {EXPENSE_LINES.map((l) => <option key={l.line} value={l.line}>{l.line} · {l.label}</option>)}
              </Select>
              <Select name="active" defaultValue={c.active ? 'on' : 'off'} disabled={Boolean(c.systemKey)}>
                <option value="on">Active</option>
                <option value="off">Hidden</option>
              </Select>
              <SubmitButton variant="ghost" size="md">Save</SubmitButton>
            </ActionForm>
          ))}
          <ActionForm action={saveCategoryAction} resetOnSuccess className="grid grid-cols-[1fr_auto] gap-2 px-4 py-3 sm:grid-cols-[1fr_16rem_auto]">
            <Input name="name" placeholder="New category" />
            <Select name="scheduleLine" defaultValue="22" className="col-span-2 sm:col-span-1">
              {EXPENSE_LINES.map((l) => <option key={l.line} value={l.line}>{l.line} · {l.label}</option>)}
            </Select>
            <SubmitButton variant="secondary">Add</SubmitButton>
          </ActionForm>
        </div>
      </Card>

      <Card>
        <CardHeader title="Job templates" />
        <div className="px-4 pb-2 text-xs text-fg-subtle">Save one from any job page (“Save as a template”), then pick it when starting a job.</div>
        <div className="divide-y divide-line border-t border-line">
          {templates.length === 0 && <div className="px-4 py-3 text-sm text-fg-subtle">None yet.</div>}
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="flex-1">{t.name} <span className="text-fg-subtle">· {t.lines.length} line{t.lines.length === 1 ? '' : 's'}</span></span>
              <ActionButton action={deleteTemplateAction} fields={{ id: t.id }} confirm="Delete this template?"><Trash2 size={14} /></ActionButton>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold">Connections</div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Sign-in</span>{authMode() === 'google' ? <Badge tone="good">Google</Badge> : <Badge tone="warn">Off (local only)</Badge>}</div>
          <div className="flex justify-between"><span>Stripe</span>{stripeEnabled() ? <Badge tone="good">Connected</Badge> : <Badge>Not set up</Badge>}</div>
          <div className="flex justify-between"><span>Database</span>{process.env.DATABASE_URL ? <Badge tone="good">Neon</Badge> : <Badge tone="warn">Local (.data)</Badge>}</div>
          <div className="flex justify-between"><span>Receipt storage</span>{process.env.BLOB_READ_WRITE_TOKEN ? <Badge tone="good">Vercel Blob</Badge> : <Badge tone="warn">Local (.data)</Badge>}</div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-1 text-sm font-semibold">Export everything</div>
        <div className="mb-3 text-xs text-fg-subtle">A ZIP with a CSV per table and every receipt and photo. Keep a copy each year with your return.</div>
        <ExportButtons years={Array.from({ length: 5 }, (_, i) => thisYear - i)} />
      </Card>
    </div>
  )
}
