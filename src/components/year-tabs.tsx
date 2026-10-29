import Link from 'next/link'

export function YearTabs({ year, thisYear, path }: { year: number; thisYear: number; path: string }) {
  return (
    <span className="flex gap-3">
      {[thisYear - 2, thisYear - 1, thisYear].map((y) => (
        <Link key={y} href={`${path}?year=${y}`} className={y === year ? 'font-semibold text-fg' : 'hover:text-fg'}>{y}</Link>
      ))}
    </span>
  )
}
