// Rough federal tax estimate for a sole proprietor: self-employment tax plus
// the income tax the business adds on top of the household's other income.
// Leaves out credits, itemized deductions, retirement contributions and
// health insurance. Figures from IRS Rev. Proc. 2024-40 / 2025-32 (as amended
// by the 2025 tax act) and the SSA wage base announcements.

export type FilingStatus = 'single' | 'married_joint' | 'married_separate' | 'head_of_household'

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  married_joint: 'Married filing jointly',
  married_separate: 'Married filing separately',
  head_of_household: 'Head of household',
}

type YearTable = {
  // Upper bound of each bracket in dollars; the last bracket has no bound.
  brackets: Record<FilingStatus, number[]>
  standardDeduction: Record<FilingStatus, number>
  ssWageBase: number
  // QBI deduction: full below the threshold, phased out over the range for a
  // business with no W-2 payroll.
  qbiThreshold: Record<FilingStatus, number>
  qbiRange: Record<FilingStatus, number>
  qbiMinimum: number
}

const RATES = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]

const byStatus = (single: number, joint: number, separate = single, head = single): Record<FilingStatus, number> =>
  ({ single, married_joint: joint, married_separate: separate, head_of_household: head })

export const TAX_TABLES: Record<number, YearTable> = {
  2025: {
    brackets: {
      single: [11925, 48475, 103350, 197300, 250525, 626350],
      married_joint: [23850, 96950, 206700, 394600, 501050, 751600],
      married_separate: [11925, 48475, 103350, 197300, 250525, 375800],
      head_of_household: [17000, 64850, 103350, 197300, 250500, 626350],
    },
    standardDeduction: byStatus(15750, 31500, 15750, 23625),
    ssWageBase: 176100,
    qbiThreshold: byStatus(197300, 394600),
    qbiRange: byStatus(50000, 100000),
    qbiMinimum: 0,
  },
  2026: {
    brackets: {
      single: [12400, 50400, 105700, 201775, 256225, 640600],
      married_joint: [24800, 100800, 211400, 403550, 512450, 768700],
      married_separate: [12400, 50400, 105700, 201775, 256225, 384350],
      head_of_household: [17700, 67450, 105700, 201775, 256225, 640600],
    },
    standardDeduction: byStatus(16100, 32200, 16100, 24150),
    ssWageBase: 184500,
    qbiThreshold: byStatus(201750, 403500),
    qbiRange: byStatus(75000, 150000),
    qbiMinimum: 400,
  },
}

// Additional Medicare tax thresholds aren't indexed.
const ADDITIONAL_MEDICARE = byStatus(200000, 250000, 125000, 200000)

// New Hampshire: Business Profits Tax and Business Enterprise Tax filing
// thresholds for taxable periods beginning 2025–2026.
export const NH = { bptRate: 0.075, bptThreshold: 109000, betRate: 0.0055, betThreshold: 298000 }

export function hasTaxTables(year: number) {
  return year in TAX_TABLES
}

function incomeTax(taxable: number, brackets: number[]) {
  let tax = 0
  let lower = 0
  for (let i = 0; i < RATES.length; i++) {
    const upper = brackets[i] ?? Infinity
    if (taxable <= lower) break
    tax += (Math.min(taxable, upper) - lower) * RATES[i]
    lower = upper
  }
  return tax
}

export type TaxEstimate = {
  netEarningsCents: number
  socialSecurityCents: number
  medicareCents: number
  seTaxCents: number
  halfSeDeductionCents: number
  standardDeductionCents: number
  qbiDeductionCents: number
  taxableIncomeCents: number
  householdIncomeTaxCents: number
  // Income tax with the business minus income tax without it.
  businessIncomeTaxCents: number
  totalCents: number
  effectivePct: number
}

export function estimateTax(year: number, { profitCents, otherIncomeCents, status }: {
  profitCents: number
  otherIncomeCents: number
  status: FilingStatus
}): TaxEstimate | null {
  const t = TAX_TABLES[year]
  if (!t) return null
  const profit = profitCents / 100
  const other = otherIncomeCents / 100

  // Schedule SE
  const net = Math.max(0, profit) * 0.9235
  const seEarnings = net < 400 ? 0 : net
  const ss = Math.min(seEarnings, t.ssWageBase) * 0.124
  const medicare = seEarnings * 0.029 + Math.max(0, seEarnings - ADDITIONAL_MEDICARE[status]) * 0.009
  const halfSe = (ss + seEarnings * 0.029) / 2

  const std = t.standardDeduction[status]
  const brackets = t.brackets[status]
  const withoutBusiness = incomeTax(Math.max(0, other - std), brackets)

  // Qualified business income deduction (section 199A)
  const qbi = profit - halfSe
  const beforeQbi = Math.max(0, other + profit - halfSe - std)
  let qbiDeduction = 0
  if (qbi > 0) {
    const over = beforeQbi - t.qbiThreshold[status]
    const phase = over <= 0 ? 1 : Math.max(0, 1 - over / t.qbiRange[status])
    qbiDeduction = Math.min(qbi * 0.2 * phase, beforeQbi * 0.2)
    if (qbi >= 1000 && t.qbiMinimum) qbiDeduction = Math.max(qbiDeduction, Math.min(t.qbiMinimum, beforeQbi))
  }
  const taxable = Math.max(0, beforeQbi - qbiDeduction)
  const withBusiness = incomeTax(taxable, brackets)

  const cents = (n: number) => Math.round(n * 100)
  const seTax = cents(ss) + cents(medicare)
  const businessIncomeTax = cents(withBusiness) - cents(withoutBusiness)
  const total = seTax + businessIncomeTax
  return {
    netEarningsCents: cents(seEarnings),
    socialSecurityCents: cents(ss),
    medicareCents: cents(medicare),
    seTaxCents: seTax,
    halfSeDeductionCents: cents(halfSe),
    standardDeductionCents: cents(std),
    qbiDeductionCents: cents(qbiDeduction),
    taxableIncomeCents: cents(taxable),
    householdIncomeTaxCents: cents(withBusiness),
    businessIncomeTaxCents: businessIncomeTax,
    totalCents: total,
    effectivePct: profitCents > 0 ? Math.round((total / profitCents) * 1000) / 10 : 0,
  }
}

// What New Hampshire might want. The BPT is shown before the deduction a
// proprietor can take for reasonable pay for their own work, which often
// brings it down a lot, and the BET paid is a credit against it.
export function estimateNh({ grossIncomeCents, profitCents }: { grossIncomeCents: number; profitCents: number }) {
  const bptApplies = grossIncomeCents > NH.bptThreshold * 100
  return {
    bptApplies,
    betMayApply: grossIncomeCents > NH.betThreshold * 100,
    bptUpToCents: bptApplies ? Math.max(0, Math.round(profitCents * NH.bptRate)) : 0,
  }
}
