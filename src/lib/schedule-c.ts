// Schedule C (Form 1040) Part II expense lines that categories can map to.
export const EXPENSE_LINES: { line: string; label: string }[] = [
  { line: '8', label: 'Advertising' },
  { line: '9', label: 'Car and truck expenses' },
  { line: '10', label: 'Commissions and fees' },
  { line: '11', label: 'Contract labor' },
  { line: '14', label: 'Employee benefit programs' },
  { line: '15', label: 'Insurance (other than health)' },
  { line: '16b', label: 'Interest (other)' },
  { line: '17', label: 'Legal and professional services' },
  { line: '18', label: 'Office expense' },
  { line: '20a', label: 'Rent or lease: vehicles, machinery, equipment' },
  { line: '20b', label: 'Rent or lease: other business property' },
  { line: '21', label: 'Repairs and maintenance' },
  { line: '22', label: 'Supplies' },
  { line: '23', label: 'Taxes and licenses' },
  { line: '24a', label: 'Travel' },
  { line: '24b', label: 'Deductible meals' },
  { line: '25', label: 'Utilities' },
  { line: '27a', label: 'Other expenses (listed in Part V)' },
]

export function lineLabel(line: string) {
  return EXPENSE_LINES.find((l) => l.line === line)?.label ?? `Line ${line}`
}

// Seeded on first run. Lines are editable in settings.
export const DEFAULT_CATEGORIES: { name: string; scheduleLine: string; systemKey?: string }[] = [
  { name: 'Shop supplies', scheduleLine: '22' },
  { name: 'Small tools', scheduleLine: '22' },
  { name: 'Welding gas and consumables', scheduleLine: '22' },
  { name: 'Equipment repairs', scheduleLine: '21' },
  { name: 'Contract labor', scheduleLine: '11' },
  { name: 'Advertising and website', scheduleLine: '8' },
  { name: 'Parking and tolls', scheduleLine: '9' },
  { name: 'Insurance', scheduleLine: '15' },
  { name: 'Tax prep and professional fees', scheduleLine: '17' },
  { name: 'Office', scheduleLine: '18' },
  { name: 'Equipment rental', scheduleLine: '20a' },
  { name: 'Shop rent', scheduleLine: '20b' },
  { name: 'Licenses and permits', scheduleLine: '23' },
  { name: 'Utilities', scheduleLine: '25' },
  { name: 'Software and subscriptions', scheduleLine: '27a' },
  { name: 'Training and education', scheduleLine: '27a' },
  { name: 'Payment processing fees', scheduleLine: '27a', systemKey: 'payment_fees' },
  { name: 'Other', scheduleLine: '27a' },
]
