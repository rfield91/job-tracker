import type { FilingStatus } from './tax-estimate'

export type SettingsData = {
  businessName: string
  ownerName: string
  address: string
  phone: string
  email: string
  website: string
  logoFileId: number | null
  invoiceFooter: string
  // Shown on printed invoices: how to pay by check, Venmo, Zelle, etc.
  paymentInstructions: string
  laborRateCents: number
  partsMarkupPct: number
  invoiceDueDays: number
  // Single items above this are suggested as equipment (de minimis limit).
  assetThresholdCents: number
  // Contract labor payees at or above this are flagged for 1099-NEC.
  contractorThresholdCents: number
  // Share of profit to set aside for taxes, used for years without tax tables.
  setAsidePct: number
  // For the tax estimate: filing status, and the household's other income
  // (wages, a spouse's pay, interest) by tax year, in cents.
  filingStatus: FilingStatus
  otherIncome: Record<string, number>
  // Standard mileage rate in cents per mile, by tax year.
  mileageRates: Record<string, number>
  timezone: string
}

export const DEFAULT_SETTINGS: SettingsData = {
  businessName: '',
  ownerName: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  logoFileId: null,
  invoiceFooter: 'Thank you for your business.',
  paymentInstructions: '',
  laborRateCents: 9500,
  partsMarkupPct: 25,
  invoiceDueDays: 14,
  assetThresholdCents: 250000,
  contractorThresholdCents: 200000,
  setAsidePct: 25,
  filingStatus: 'single',
  otherIncome: {},
  mileageRates: { '2025': 70 },
  timezone: 'America/New_York',
}
