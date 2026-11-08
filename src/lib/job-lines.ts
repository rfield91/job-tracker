// How many of a part line. Bought parts and parts from stock keep their
// quantity on the costs behind the line; products and quoted parts on the line.
export function partQuantity(
  line: { id: number; purchaseLineId: number | null; productId: number | null; quantityHundredths: number | null },
  costs: { id: number; useId: number | null; jobLineId: number | null; quantityHundredths: number }[],
) {
  const own = line.quantityHundredths ?? 100
  if (line.productId) return own
  const behind = line.purchaseLineId
    ? costs.filter((c) => c.useId == null && c.id === line.purchaseLineId)
    : costs.filter((c) => c.useId != null && c.jobLineId === line.id)
  return behind.length ? behind.reduce((a, c) => a + c.quantityHundredths, 0) : own
}
