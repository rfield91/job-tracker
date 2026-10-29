'use server'

import { redirect } from 'next/navigation'
import { eq, max } from 'drizzle-orm'
import type { FormState } from '@/lib/form-state'
import { int, money, oneOf, optDate, optStr, reqDate, reqInt, reqMoney, scaled, str } from '@/lib/form'
import { categories, type AssetTreatment } from '@/db/schema'
import { EXPENSE_LINES } from '@/lib/schedule-c'
import { parseMoney } from '@/lib/money'
import { FILING_STATUS_LABELS, type FilingStatus } from '@/lib/tax-estimate'
import { createAsset, deleteAsset, updateAsset } from '@/server/assets'
import { createVehicle, parseVehicle } from '@/server/jobs'
import { deleteCustomer, deleteVehicle, updateCustomer, updateVehicle } from '@/server/customers'
import { saveSettings } from '@/server/settings'
import { saveUpload } from '@/server/files'
import { addTrip, deleteTrip } from '@/server/trips'
import { run } from './run'

const TREATMENTS = ['undecided', 'de_minimis', 'section_179', 'bonus', 'macrs'] as const satisfies readonly AssetTreatment[]

export async function updateCustomerAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const name = str(fd, 'name')
    if (!name) throw new Error('Enter a name')
    await updateCustomer(db, reqInt(fd, 'id'), { name, phone: optStr(fd, 'phone'), email: optStr(fd, 'email'), notes: optStr(fd, 'notes') })
  })
}

export async function deleteCustomerAction(_: FormState, fd: FormData): Promise<FormState> {
  const result = await run(async (db) => {
    await deleteCustomer(db, reqInt(fd, 'id'))
  })
  if (result?.error) return result
  redirect('/customers')
}

export async function addVehicleAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const v = parseVehicle(str(fd, 'vehicleText'))
    if (!v) throw new Error('Enter the car, like “2008 Subaru WRX”')
    await createVehicle(db, reqInt(fd, 'customerId'), { ...v, vin: optStr(fd, 'vin') })
  })
}

export async function updateVehicleAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await updateVehicle(db, reqInt(fd, 'id'), {
      year: int(fd, 'year'), make: optStr(fd, 'make'), model: optStr(fd, 'model'), trim: optStr(fd, 'trim'),
      vin: optStr(fd, 'vin'), notes: optStr(fd, 'notes'),
    })
  })
}

export async function deleteVehicleAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await deleteVehicle(db, reqInt(fd, 'id'))
  })
}

function assetFields(fd: FormData) {
  const pct = int(fd, 'businessUsePct') ?? 100
  if (pct < 1 || pct > 100) throw new Error('Business use must be between 1 and 100%')
  return {
    description: str(fd, 'description'),
    placedInServiceOn: reqDate(fd, 'placedInServiceOn', 'the date it went into service'),
    costCents: reqMoney(fd, 'cost', 'the cost'),
    businessUsePct: pct,
    treatment: oneOf(fd, 'treatment', TREATMENTS, 'undecided'),
    disposedOn: optDate(fd, 'disposedOn'),
    notes: optStr(fd, 'notes'),
  }
}

export async function createAssetAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const f = assetFields(fd)
    if (!f.description) throw new Error('Describe the equipment')
    await createAsset(db, f)
  })
}

export async function updateAssetAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const id = reqInt(fd, 'id')
    const pct = int(fd, 'businessUsePct') ?? 100
    if (pct < 1 || pct > 100) throw new Error('Business use must be between 1 and 100%')
    const cost = money(fd, 'cost')
    const placed = optDate(fd, 'placedInServiceOn')
    await updateAsset(db, id, {
      description: str(fd, 'description'),
      businessUsePct: pct,
      treatment: oneOf(fd, 'treatment', TREATMENTS, 'undecided'),
      disposedOn: optDate(fd, 'disposedOn'),
      notes: optStr(fd, 'notes'),
      ...(cost != null ? { costCents: cost } : {}),
      ...(placed ? { placedInServiceOn: placed } : {}),
    })
  })
}

export async function deleteAssetAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await deleteAsset(db, reqInt(fd, 'id'))
  })
}

export async function addTripAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await addTrip(db, {
      tripOn: reqDate(fd, 'tripOn'),
      milesTenths: scaled(fd, 'miles', 10) ?? 0,
      purpose: str(fd, 'purpose'),
      jobId: int(fd, 'jobId'),
    })
  })
}

export async function deleteTripAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    await deleteTrip(db, reqInt(fd, 'id'))
  })
}

export async function saveSettingsAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const rates: Record<string, number> = {}
    for (const [k, v] of fd.entries()) {
      const m = k.match(/^mileage_(\d{4})$/)
      if (m && typeof v === 'string' && v.trim()) {
        const n = Number(v)
        if (!Number.isFinite(n) || n <= 0 || n > 500) throw new Error(`Mileage rate for ${m[1]} should be in cents per mile`)
        rates[m[1]] = n
      }
    }
    const otherIncome: Record<string, number> = {}
    for (const [k, v] of fd.entries()) {
      const m = k.match(/^otherIncome_(\d{4})$/)
      if (m && typeof v === 'string' && v.trim()) {
        const cents = parseMoney(v)
        if (cents == null || cents < 0) throw new Error(`Other income for ${m[1]} should be an amount`)
        otherIncome[m[1]] = cents
      }
    }
    const newYear = str(fd, 'mileage_new_year')
    const newRate = str(fd, 'mileage_new_rate')
    if (newYear && newRate) rates[newYear] = Number(newRate)
    let logoFileId: number | null | undefined
    const logo = fd.get('logo')
    if (logo instanceof File && logo.size > 0) {
      if (!logo.type.startsWith('image/')) throw new Error('The logo must be an image')
      logoFileId = (await saveUpload(db, logo, { kind: 'logo' }))?.id ?? null
    }
    if (str(fd, 'removeLogo')) logoFileId = null
    await saveSettings(db, {
      businessName: str(fd, 'businessName'),
      ownerName: str(fd, 'ownerName'),
      address: str(fd, 'address'),
      phone: str(fd, 'phone'),
      email: str(fd, 'email'),
      website: str(fd, 'website'),
      invoiceFooter: str(fd, 'invoiceFooter'),
      paymentInstructions: str(fd, 'paymentInstructions'),
      laborRateCents: money(fd, 'laborRate') ?? 0,
      partsMarkupPct: Number(str(fd, 'partsMarkupPct') || 0),
      invoiceDueDays: int(fd, 'invoiceDueDays') ?? 14,
      assetThresholdCents: money(fd, 'assetThreshold') ?? 250000,
      contractorThresholdCents: money(fd, 'contractorThreshold') ?? 200000,
      setAsidePct: Number(str(fd, 'setAsidePct') || 0),
      filingStatus: oneOf(fd, 'filingStatus', FILING_STATUSES, 'single'),
      otherIncome,
      mileageRates: rates,
      timezone: str(fd, 'timezone') || 'America/New_York',
      ...(logoFileId !== undefined ? { logoFileId } : {}),
    })
  })
}

const LINES = EXPENSE_LINES.map((l) => l.line)
const FILING_STATUSES = Object.keys(FILING_STATUS_LABELS) as FilingStatus[]

export async function saveCategoryAction(_: FormState, fd: FormData) {
  return run(async (db) => {
    const id = int(fd, 'id')
    const name = str(fd, 'name')
    if (!name) throw new Error('Enter a name')
    const line = oneOf(fd, 'scheduleLine', LINES, '27a')
    if (id) {
      await db.update(categories).set({ name, scheduleLine: line, active: str(fd, 'active') !== 'off' }).where(eq(categories.id, id))
    } else {
      const [{ m }] = await db.select({ m: max(categories.sortOrder) }).from(categories)
      await db.insert(categories).values({ name, scheduleLine: line, sortOrder: (m ?? 0) + 1 })
    }
  })
}
