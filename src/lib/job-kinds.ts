import type { JobKind } from '@/db/schema'

export const KIND_LABELS: Record<JobKind, string> = {
  service: 'Service',
  fabrication: 'Fabrication',
  sale: 'Sale',
}
