import { PageHeader } from '@/components/ui'
import { Importer } from './importer'

export const metadata = { title: 'Import' }

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Import from spreadsheets"
        subtitle="In Google Sheets: File → Download → Comma-separated values (.csv). Then pick the file here and match up the columns." />
      <Importer />
    </div>
  )
}
