import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { ActionButton, ActionForm, SubmitButton } from '@/components/forms'
import { Card, Empty, Field, Input, Notice, PageHeader, Select } from '@/components/ui'
import { addTripAction, deleteTripAction } from '@/app/actions/misc'
import { formatDate } from '@/lib/dates'
import { formatMoney, formatScaled } from '@/lib/money'
import { authedDb } from '@/server/session'
import { jobNumber } from '@/server/jobs'
import { jobOptions } from '@/server/pickers'
import { getSettings, today } from '@/server/settings'
import { listTrips } from '@/server/trips'

export const metadata = { title: 'Mileage' }

export default async function MileagePage({ searchParams }: PageProps<'/mileage'>) {
  const sp = await searchParams
  const db = await authedDb()
  const now = await today(db)
  const year = typeof sp.year === 'string' ? Number(sp.year) : Number(now.slice(0, 4))
  const trips = await listTrips(db, year)
  const settings = await getSettings(db)
  const rate = settings.mileageRates[String(year)]
  const miles = trips.reduce((a, t) => a + t.trip.milesTenths, 0)
  const jobs = await jobOptions(db, 40)
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Mileage" subtitle="Business driving: parts runs, pickups, supply trips. Commuting doesn’t count." />
      <Card className="p-4">
        <ActionForm action={addTripAction} resetOnSuccess className="grid grid-cols-2 gap-3 sm:grid-cols-[8rem_6rem_1fr]">
          <Field label="Date"><Input type="date" name="tripOn" defaultValue={now} required /></Field>
          <Field label="Miles"><Input name="miles" inputMode="decimal" placeholder="24" required /></Field>
          <Field label="Purpose" className="col-span-2 sm:col-span-1"><Input name="purpose" placeholder="Parts run to NAPA" required /></Field>
          <Field label="Job (optional)" className="col-span-2">
            <Select name="jobId" defaultValue="">
              <option value="">None</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.label} — {j.sub}</option>)}
            </Select>
          </Field>
          <div className="col-span-2 flex items-end justify-end sm:col-span-1"><SubmitButton>Add trip</SubmitButton></div>
        </ActionForm>
      </Card>
      {rate == null && miles > 0 && (
        <Notice>No standard mileage rate is set for {year}. <Link href="/settings" className="underline">Add it in settings</Link> so the tax worksheet can count the deduction.</Notice>
      )}
      <Card>
        <div className="flex justify-between border-b border-line px-4 py-2 text-xs text-fg-subtle">
          <span>
            {[year - 1, year].map((y) => (
              <Link key={y} href={`/mileage?year=${y}`} className={y === year ? 'mr-2 font-semibold text-fg' : 'mr-2 hover:text-fg'}>{y}</Link>
            ))}
          </span>
          <span>{formatScaled(miles, 10)} mi{rate != null && ` · ${formatMoney(Math.round((miles / 10) * rate))} at ${rate}¢`}</span>
        </div>
        {trips.length === 0 ? <Empty>No trips logged for {year}.</Empty> : (
          <div className="divide-y divide-line">
            {trips.map(({ trip, job }) => (
              <div key={trip.id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-14 shrink-0 text-xs text-fg-subtle">{formatDate(trip.tripOn, { year: false })}</span>
                <span className="min-w-0 flex-1 text-sm">
                  {trip.purpose}
                  {job && <Link href={`/jobs/${job.id}`} className="block text-xs text-fg-muted hover:underline">#{jobNumber(job)} {job.title}</Link>}
                </span>
                <span className="text-sm tabular">{formatScaled(trip.milesTenths, 10)} mi</span>
                <ActionButton action={deleteTripAction} fields={{ id: trip.id }} confirm="Delete this trip?"><Trash2 size={14} /></ActionButton>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
