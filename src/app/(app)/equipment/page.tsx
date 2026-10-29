import Link from 'next/link'
import { ActionButton, ActionForm, SubmitButton } from '@/components/forms'
import { Badge, Card, CardHeader, Empty, Field, Input, Money, MoneyInput, PageHeader, Select } from '@/components/ui'
import { createAssetAction, deleteAssetAction, updateAssetAction } from '@/app/actions/misc'
import { formatDate, yearOf } from '@/lib/dates'
import { centsToInput } from '@/lib/money'
import { authedDb } from '@/server/session'
import { listAssets, TREATMENT_LABELS } from '@/server/assets'
import { today } from '@/server/settings'

export const metadata = { title: 'Equipment' }

const TREATMENTS = Object.entries(TREATMENT_LABELS)

export default async function EquipmentPage() {
  const db = await authedDb()
  const rows = await listAssets(db)
  const now = await today(db)
  const byYear = new Map<number, typeof rows>()
  for (const r of rows) {
    const y = yearOf(r.asset.placedInServiceOn)
    byYear.set(y, [...(byYear.get(y) ?? []), r])
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Equipment" subtitle="Tools and machines kept for depreciation instead of expensed as supplies. Your tax software asks for these details on Form 4562." />
      {[...byYear.entries()].map(([year, list]) => (
        <Card key={year}>
          <CardHeader title={`Placed in service in ${year}`} action={<Money cents={list.reduce((a, r) => a + r.asset.costCents, 0)} className="text-sm" />} />
          <div className="divide-y divide-line border-t border-line">
            {list.map(({ asset: a, purchaseId, vendor }) => (
              <details key={a.id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{a.description}</span>
                    <span className="block text-xs text-fg-muted">
                      {formatDate(a.placedInServiceOn)} · {a.businessUsePct}% business use{vendor ? ` · ${vendor}` : ''}
                    </span>
                  </span>
                  <Badge tone={a.treatment === 'undecided' ? 'warn' : 'neutral'}>{TREATMENT_LABELS[a.treatment]}</Badge>
                  <Money cents={a.costCents} className="text-sm" />
                </summary>
                <div className="bg-raised px-4 py-3">
                  <ActionForm action={updateAssetAction} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={a.id} />
                    <Field label="Description" className="sm:col-span-2"><Input name="description" defaultValue={a.description} /></Field>
                    {purchaseId ? (
                      <div className="text-sm text-fg-muted sm:col-span-2">
                        Cost and date come from <Link href={`/purchases/${purchaseId}`} className="underline">the purchase</Link>.
                      </div>
                    ) : (
                      <>
                        <Field label="Placed in service"><Input type="date" name="placedInServiceOn" defaultValue={a.placedInServiceOn} /></Field>
                        <Field label="Cost"><MoneyInput name="cost" defaultValue={centsToInput(a.costCents)} /></Field>
                      </>
                    )}
                    <Field label="Business use %"><Input name="businessUsePct" defaultValue={a.businessUsePct} inputMode="numeric" /></Field>
                    <Field label="Tax treatment" hint="What you chose on the return">
                      <Select name="treatment" defaultValue={a.treatment}>
                        {TREATMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </Select>
                    </Field>
                    <Field label="Sold or retired"><Input type="date" name="disposedOn" defaultValue={a.disposedOn ?? ''} /></Field>
                    <Field label="Notes"><Input name="notes" defaultValue={a.notes ?? ''} /></Field>
                    <div className="flex justify-end sm:col-span-2"><SubmitButton variant="secondary">Save</SubmitButton></div>
                  </ActionForm>
                  {!purchaseId && (
                    <ActionButton action={deleteAssetAction} fields={{ id: a.id }} variant="danger" confirm="Delete this equipment row?">Delete</ActionButton>
                  )}
                </div>
              </details>
            ))}
          </div>
        </Card>
      ))}
      {rows.length === 0 && <Card><Empty>No equipment yet. Choose “Equipment” when logging a big purchase, or add one below.</Empty></Card>}
      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold">Add equipment bought outside the app</div>
        <ActionForm action={createAssetAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
          <Field label="Description" className="sm:col-span-2"><Input name="description" placeholder="Lathe, bandsaw, TIG welder…" required /></Field>
          <Field label="Placed in service"><Input type="date" name="placedInServiceOn" defaultValue={now} required /></Field>
          <Field label="Cost"><MoneyInput name="cost" required /></Field>
          <Field label="Business use %"><Input name="businessUsePct" defaultValue="100" inputMode="numeric" /></Field>
          <Field label="Tax treatment">
            <Select name="treatment" defaultValue="undecided">
              {TREATMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end sm:col-span-2"><SubmitButton>Add equipment</SubmitButton></div>
        </ActionForm>
      </Card>
    </div>
  )
}
