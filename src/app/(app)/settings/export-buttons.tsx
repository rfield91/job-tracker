'use client'

import { useState } from 'react'
import { Select } from '@/components/ui'
import { ZipExportButton } from '@/components/zip-export'

export function ExportButtons({ years }: { years: number[] }) {
  const [year, setYear] = useState(String(years[0]))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ZipExportButton query="kind=all" label="Full backup" />
      <span className="mx-2 text-sm text-fg-subtle">or tax year</span>
      <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-28">
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </Select>
      <ZipExportButton query={`kind=year&year=${year}`} label="Tax package" />
    </div>
  )
}
