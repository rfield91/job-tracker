'use client'

import { useState } from 'react'
import { ActionForm, SubmitButton } from '@/components/forms'
import { PaymentFields } from '@/components/payment-fields'
import { Card, Field, Select } from '@/components/ui'
import { addPaymentAction } from '@/app/actions/jobs'
import type { JobOption } from '@/server/pickers'

export function NewPaymentForm({ jobs, today }: { jobs: JobOption[]; today: string }) {
  const [jobId, setJobId] = useState('')
  return (
    <ActionForm action={addPaymentAction}>
      <input type="hidden" name="redirect" value="1" />
      <Card className="space-y-4 p-4">
        <Field label="Job">
          <Select name="jobId" value={jobId} onChange={(e) => setJobId(e.target.value)} required>
            <option value="">Pick a job…</option>
            <optgroup label="Open or owing">
              {jobs.filter((j) => j.open).map((j) => <option key={j.id} value={j.id}>{j.label} — {j.sub}</option>)}
            </optgroup>
            <optgroup label="Recent">
              {jobs.filter((j) => !j.open).map((j) => <option key={j.id} value={j.id}>{j.label} — {j.sub}</option>)}
            </optgroup>
          </Select>
        </Field>
        <PaymentFields today={today} />
      </Card>
      <div className="mt-4 flex justify-end"><SubmitButton size="lg">Save payment</SubmitButton></div>
    </ActionForm>
  )
}
