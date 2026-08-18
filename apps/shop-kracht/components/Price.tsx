import { euro, excludingVat } from '../lib/catalog'

/**
 * Both prices ship in the markup and CSS decides which one shows, so the BTW toggle is instant
 * and the page is correct before any script runs.
 */
export function Price({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={className}>
      <span data-vat="incl">{euro(amount)}</span>
      <span data-vat="excl">{euro(excludingVat(amount))}</span>
    </span>
  )
}
