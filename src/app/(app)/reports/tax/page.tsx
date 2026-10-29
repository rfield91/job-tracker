import Link from 'next/link'
import type { ReactNode } from 'react'
import { Download } from 'lucide-react'
import { PrintButton } from '@/components/print-button'
import { YearTabs } from '@/components/year-tabs'
import { ZipExportButton } from '@/components/zip-export'
import { Badge, Card, cx, Money, Notice, PageHeader } from '@/components/ui'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { FILING_STATUS_LABELS, NH } from '@/lib/tax-estimate'
import { authedDb } from '@/server/session'
import { TREATMENT_LABELS } from '@/server/assets'
import { METHOD_LABELS } from '@/server/payments'
import { taxWorksheet } from '@/server/reports'
import { today } from '@/server/settings'

export const metadata = { title: 'Tax worksheet' }

export default async function TaxPage({ searchParams }: PageProps<'/reports/tax'>) {
  const sp = await searchParams
  const db = await authedDb()
  const thisYear = Number((await today(db)).slice(0, 4))
  const year = typeof sp.year === 'string' ? Number(sp.year) : thisYear - (new Date().getMonth() < 4 ? 1 : 0)
  const w = await taxWorksheet(db, year)
  const c = w.checks
  const e = w.estimate
  const f = e.federal
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print">
        <PageHeader back={{ href: `/reports?year=${year}`, label: 'Reports' }} title={`Tax worksheet ${year}`}
          subtitle={<YearTabs year={year} thisYear={thisYear} path="/reports/tax" />}
          actions={<>
            <a href={`/api/export?kind=csv&name=tax&year=${year}`} className="inline-flex h-10 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-hover"><Download size={15} />CSV</a>
            <ZipExportButton query={`kind=year&year=${year}`} label="Receipts + CSVs" />
            <PrintButton label="Print / PDF" />
          </>} />
      </div>
      <div className="hidden text-lg font-semibold print:block">Schedule C worksheet {year} — {w.settings.businessName}</div>

      {(c.unassignedCount > 0 || c.unmatchedPayments > 0 || c.missingMileageRate || c.undecidedAssets > 0) && (
        <Notice className="no-print space-y-1">
          <div className="font-medium">Before you file</div>
          {c.unassignedCount > 0 && <div>· <Link className="underline" href="/purchases?needsHome=1">{c.unassignedCount} purchase{c.unassignedCount === 1 ? '' : 's'}</Link> ({formatMoney(c.unassignedCents)}) aren’t on a job or category, so they’re not counted below.</div>}
          {c.unmatchedPayments > 0 && <div>· <Link className="underline" href="/payments/unmatched">{c.unmatchedPayments} Stripe payment{c.unmatchedPayments === 1 ? '' : 's'}</Link> aren’t matched to a job. They’re counted as income, but match them so job profit is right.</div>}
          {c.missingMileageRate && <div>· No standard mileage rate set for {year}. <Link className="underline" href="/settings">Add it</Link>.</div>}
          {c.undecidedAssets > 0 && <div>· {c.undecidedAssets} piece{c.undecidedAssets === 1 ? '' : 's'} of equipment have no tax treatment recorded yet. Record what you chose on the <Link className="underline" href="/equipment">equipment page</Link> after filing.</div>}
        </Notice>
      )}

      <Section title="Part I · Income">
        <Line n="1" label="Gross receipts" cents={w.grossReceiptsCents} />
        <Line n="2" label="Returns and allowances (refunds)" cents={w.returnsCents} />
        <Line n="4" label="Cost of goods sold (Part III)" cents={w.cogs.totalCents} />
        <Line n="5" label="Gross profit" cents={w.grossProfitCents} strong />
        <Sub>
          <div className="mb-1 font-medium text-fg-muted">Received by method (compare with any 1099-K)</div>
          {w.byMethod.map((m) => (
            <div key={m.method} className="flex justify-between">
              <span>{METHOD_LABELS[m.method]} <span className="text-fg-subtle">· {m.count} payment{m.count === 1 ? '' : 's'}{m.feeCents ? ` · fees ${formatMoney(m.feeCents)}` : ''}</span></span>
              <Money cents={m.grossCents} />
            </div>
          ))}
          {w.byMethod.length === 0 && <div className="text-fg-subtle">No payments recorded.</div>}
        </Sub>
      </Section>

      <Section title="Part II · Expenses">
        {w.expenses.length === 0 && <div className="px-4 py-3 text-sm text-fg-subtle">No expenses recorded.</div>}
        {w.expenses.map((e) => (
          <div key={e.line}>
            <Line n={e.line} label={e.label} cents={e.totalCents} />
            {(e.items.length > 1 || e.line === '27a') && (
              <Sub>
                {e.items.map((i) => (
                  <div key={i.name} className="flex justify-between">
                    {i.categoryId
                      ? <Link href={`/purchases?year=${year}&category=${i.categoryId}`} className="hover:underline">{i.name}</Link>
                      : <span>{i.name}</span>}
                    <Money cents={i.totalCents} />
                  </div>
                ))}
              </Sub>
            )}
          </div>
        ))}
        <Line n="13" label="Depreciation and section 179 (from Form 4562, see equipment below)" note="Your tax software calculates this" />
        <Line n="28" label="Total expenses before depreciation" cents={w.totalExpensesCents} strong />
        <Line n="" label="Net profit before depreciation" cents={w.netBeforeDepreciationCents} strong />
      </Section>

      <Section title="Part III · Cost of goods sold">
        <Line n="35" label="Inventory at beginning of year (stock on the shelf)" cents={w.cogs.beginningStockCents} />
        <Line n="36" label="Purchases (parts and materials for jobs)" cents={w.cogs.purchasesCents} />
        {(w.cogs.stockBoughtCents > 0 || w.cogs.shopUseCents > 0) && (
          <Sub>
            {w.cogs.stockBoughtCents > 0 && <div>Includes {formatMoney(w.cogs.stockBoughtCents)} bought for stock</div>}
            {w.cogs.shopUseCents > 0 && <div>Less {formatMoney(w.cogs.shopUseCents)} of stock the shop used itself, counted in its expense categories above</div>}
          </Sub>
        )}
        <Line n="37" label="Cost of labor (subcontracted on jobs)" cents={w.cogs.laborCents} />
        <Line n="41" label="Inventory at end of year (stock on the shelf)" cents={w.cogs.endingStockCents} />
        {w.cogs.endingStockCents > 0 && <Sub><Link className="underline" href="/stock">See what’s in stock</Link>. Count the shelf at year end and fix anything that was used or scrapped.</Sub>}
        <Line n="42" label="Cost of goods sold" cents={w.cogs.totalCents} strong />
      </Section>

      <Section title="Part IV · Vehicle">
        <Line n="44a" label="Business miles" note={`${(w.mileage.milesTenths / 10).toLocaleString()} mi from ${w.mileage.tripCount} trip${w.mileage.tripCount === 1 ? '' : 's'}`} />
        <Sub>
          {w.mileage.rateCentsPerMile != null
            ? <>Standard mileage at {w.mileage.rateCentsPerMile}¢/mi = {formatMoney(w.mileage.deductionCents)} (included in line 9). Your software also asks for total miles driven, commuting miles and when the vehicle was placed in service.</>
            : <>Set the {year} standard mileage rate in settings to include the deduction.</>}
        </Sub>
      </Section>

      <Section title="Equipment placed in service (Form 4562)">
        {w.assets.length === 0 ? <div className="px-4 py-3 text-sm text-fg-subtle">None in {year}.</div> : (
          <div className="divide-y divide-line">
            {w.assets.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-20 shrink-0 text-xs text-fg-subtle">{formatDate(a.placedInServiceOn, { year: false })}</span>
                <span className="flex-1">{a.description} <span className="text-fg-subtle">· {a.businessUsePct}% business</span></span>
                <Badge tone={a.treatment === 'undecided' ? 'warn' : 'neutral'}>{TREATMENT_LABELS[a.treatment]}</Badge>
                <Money cents={a.costCents} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Contract labor by payee (1099-NEC)">
        {w.contractors.length === 0 ? <div className="px-4 py-3 text-sm text-fg-subtle">No contract labor recorded.</div> : (
          <div className="divide-y divide-line">
            {w.contractors.map((x) => (
              <div key={x.payee} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="flex-1">{x.payee}</span>
                {x.flagged && <Badge tone="warn">May need a 1099-NEC</Badge>}
                <Money cents={x.totalCents} />
              </div>
            ))}
          </div>
        )}
        <Sub>Flagged at {formatMoney(w.settings.contractorThresholdCents, { whole: true })} (settings). Card and PayPal payments to contractors are reported by the processor instead.</Sub>
      </Section>

      <Section title="Estimated tax">
        {!f ? (
          <div className="px-4 py-3 text-sm text-fg-subtle">No federal tax tables for {year} yet, so there’s no estimate.</div>
        ) : (
          <>
            <Line n="" label="Net profit before depreciation" cents={w.netBeforeDepreciationCents} />
            {e.equipmentDeductionCents > 0 && <Line n="" label="Equipment expensed this year (de minimis, Section 179, bonus)" cents={-e.equipmentDeductionCents} />}
            <Line n="" label="Profit for the estimate" cents={e.profitCents} strong />
            <Line n="" label={`Self-employment tax (${formatMoney(f.netEarningsCents, { whole: true })} of net earnings)`} cents={f.seTaxCents} />
            <Sub>Social Security {formatMoney(f.socialSecurityCents)} · Medicare {formatMoney(f.medicareCents)}</Sub>
            <Line n="" label="Federal income tax the business adds" cents={f.businessIncomeTaxCents} />
            <Sub>
              <div className="flex justify-between"><span>Other household income ({FILING_STATUS_LABELS[w.settings.filingStatus].toLowerCase()})</span><Money cents={e.otherIncomeCents ?? 0} /></div>
              <div className="flex justify-between"><span>Less half of self-employment tax</span><Money cents={-f.halfSeDeductionCents || 0} /></div>
              <div className="flex justify-between"><span>Less standard deduction</span><Money cents={-f.standardDeductionCents || 0} /></div>
              <div className="flex justify-between"><span>Less qualified business income deduction</span><Money cents={-f.qbiDeductionCents || 0} /></div>
              <div className="flex justify-between"><span>Household taxable income</span><Money cents={f.taxableIncomeCents} /></div>
              <div className="flex justify-between"><span>Household federal income tax</span><Money cents={f.householdIncomeTaxCents} /></div>
            </Sub>
            <Line n="" label={`Federal tax from the business${f.effectivePct ? ` (${f.effectivePct}% of profit)` : ''}`} cents={f.totalCents} strong />
            {(e.otherIncomeCents == null || c.undecidedAssets > 0 || e.macrsCount > 0) && (
              <Sub>
                {e.otherIncomeCents == null && <div>No other household income entered for {year}, so this assumes none. <Link className="underline" href="/settings">Add it in settings</Link> if anyone in the household has wages or other income.</div>}
                {c.undecidedAssets > 0 && <div>Equipment with no tax treatment yet isn’t deducted. Expensing it would lower this.</div>}
                {e.macrsCount > 0 && <div>Regular depreciation on equipment isn’t included; your tax software works it out.</div>}
              </Sub>
            )}
          </>
        )}
        <Line n="" label="NH gross business income" cents={w.grossIncomeCents} />
        <Sub>
          {e.nh.bptApplies
            ? <>Over the {formatMoney(NH.bptThreshold * 100, { whole: true })} Business Profits Tax threshold, so you’d file a BPT return. At 7.5% of profit that’s up to {formatMoney(e.nh.bptUpToCents, { whole: true })}, before the deduction for reasonable pay for your own work, which can bring it down a lot.</>
            : <>Under the {formatMoney(NH.bptThreshold * 100, { whole: true })} Business Profits Tax threshold, so no BPT return.</>}
          {e.nh.betMayApply && <> Over {formatMoney(NH.betThreshold * 100, { whole: true })}, so the Business Enterprise Tax (0.55%) may apply too; what you pay is a credit against the BPT.</>}
          {' '}NH has no sales tax and no tax on wages.
        </Sub>
        <Sub>Leaves out credits, itemized deductions, retirement contributions, health insurance and other income’s withholding. Your other income’s Social Security wages aren’t counted against the wage cap.</Sub>
      </Section>

      <div className="text-xs text-fg-subtle">Cash basis. This worksheet organizes your records; it isn’t tax advice. Check categories against the Schedule C instructions.</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="print-plain overflow-hidden break-inside-avoid">
      <div className="border-b border-line bg-raised px-4 py-2 text-sm font-semibold">{title}</div>
      {children}
    </Card>
  )
}

function Line({ n, label, cents, strong, note }: { n: string; label: string; cents?: number; strong?: boolean; note?: string }) {
  return (
    <div className={cx('flex items-baseline gap-3 border-b border-line/60 px-4 py-2 text-sm last:border-0', strong && 'font-semibold')}>
      <span className="w-10 shrink-0 text-xs text-fg-subtle tabular">{n}</span>
      <span className="flex-1">{label}</span>
      {cents != null ? <Money cents={cents} signed /> : <span className="text-xs text-fg-subtle">{note}</span>}
    </div>
  )
}

function Sub({ children }: { children: ReactNode }) {
  return <div className="space-y-0.5 border-b border-line/60 py-2 pr-4 pl-17 text-xs text-fg-muted last:border-0">{children}</div>
}
