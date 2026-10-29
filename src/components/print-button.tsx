'use client'

import { Printer } from 'lucide-react'
import { Button } from './ui'

export function PrintButton({ label = 'Print or save PDF' }: { label?: string }) {
  return <Button variant="primary" onClick={() => window.print()}><Printer size={15} />{label}</Button>
}
