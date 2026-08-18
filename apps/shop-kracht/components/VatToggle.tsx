'use client'

/**
 * Dutch shops quote incl. BTW to consumers and excl. BTW to businesses. The choice lives in one
 * class on <html>, so the button state is styled by CSS rather than held in React — every copy of
 * this control on the page therefore agrees, and none of them can disagree with the prices.
 */
export function VatToggle() {
  function choose(exclusive: boolean) {
    document.documentElement.classList.toggle('vat-excl', exclusive)
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-ink-sunk p-1 text-xs font-semibold">
      <button
        type="button"
        data-vat-set="incl"
        onClick={() => choose(false)}
        className="vat-option"
      >
        Incl. VAT
      </button>
      <button type="button" data-vat-set="excl" onClick={() => choose(true)} className="vat-option">
        Excl. VAT
      </button>
    </div>
  )
}
