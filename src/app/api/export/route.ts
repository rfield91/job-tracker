import { authedDb } from '@/server/session'
import { paymentsCsv, photoFiles, purchasesCsv, receiptFiles, tablesAsCsv, taxWorksheetCsv } from '@/server/export'
import { jobsReportCsv } from '@/server/export-jobs'

// ?kind=all            → every table as CSV + every file (backup)
// ?kind=year&year=2026 → that year's worksheet, purchases, payments, jobs + receipts
// ?kind=csv&name=tax|purchases|payments|jobs&year=2026 → a single CSV download
// The browser fetches the listed files and builds the ZIP, so large receipt
// sets never pass through one function response.
export async function GET(request: Request) {
  let db
  try {
    db = await authedDb()
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }
  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  const year = Number(url.searchParams.get('year'))

  if (kind === 'csv') {
    if (!Number.isInteger(year)) return new Response('year required', { status: 400 })
    const name = url.searchParams.get('name')
    const make = { tax: taxWorksheetCsv, purchases: purchasesCsv, payments: paymentsCsv, jobs: jobsReportCsv }[name ?? '']
    if (!make) return new Response('unknown export', { status: 400 })
    return new Response(await make(db, year), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${name}-${year}.csv"`,
      },
    })
  }
  if (kind === 'all') {
    return Response.json({
      name: `shop-backup-${new Date().toISOString().slice(0, 10)}`,
      texts: await tablesAsCsv(db),
      files: [...await receiptFiles(db), ...await photoFiles(db)],
    })
  }
  if (kind === 'year' && Number.isInteger(year)) {
    return Response.json({
      name: `shop-taxes-${year}`,
      texts: {
        [`schedule-c-worksheet-${year}.csv`]: await taxWorksheetCsv(db, year),
        [`purchases-${year}.csv`]: await purchasesCsv(db, year),
        [`payments-${year}.csv`]: await paymentsCsv(db, year),
        [`jobs-${year}.csv`]: await jobsReportCsv(db, year),
      },
      files: await receiptFiles(db, year),
    })
  }
  return new Response('Bad request', { status: 400 })
}
