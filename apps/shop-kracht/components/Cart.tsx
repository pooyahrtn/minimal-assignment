'use client'

import { useSyncExternalStore } from 'react'
import {
  type CartLine,
  serverSnapshot,
  setQty,
  snapshot,
  subscribe,
  totalItems,
  totalPrice,
} from '../lib/cart-store'
import { euro, excludingVat, FREE_SHIPPING_FROM } from '../lib/catalog'

function close() {
  const drawer = document.getElementById('cart-drawer')
  if (drawer instanceof HTMLDialogElement) drawer.close()
}

function Line({ line }: { line: CartLine }) {
  return (
    <li className="flex gap-3 rounded-xl bg-ink-card p-3 shadow-card">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-sunk">
        {line.image ? (
          // biome-ignore lint/performance/noImgElement: packshots are local files at fixed sizes
          <img src={line.image} alt="" className="size-full object-contain p-1" />
        ) : (
          <span className="text-lg font-black text-signal">K</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{line.name}</p>
        <p className="text-xs text-mute">{line.flavour}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center rounded-lg bg-ink-sunk text-sm font-bold">
            <button
              type="button"
              aria-label={`One fewer ${line.name}`}
              className="px-3 py-1 text-mute hover:text-white"
              onClick={() => setQty(line.slug, line.qty - 1)}
            >
              −
            </button>
            <span className="min-w-6 text-center">{line.qty}</span>
            <button
              type="button"
              aria-label={`One more ${line.name}`}
              className="px-3 py-1 text-mute hover:text-white"
              onClick={() => setQty(line.slug, line.qty + 1)}
            >
              +
            </button>
          </div>
          <span className="text-sm font-extrabold">
            <span data-vat="incl">{euro(line.price * line.qty)}</span>
            <span data-vat="excl">{euro(excludingVat(line.price * line.qty))}</span>
          </span>
        </div>
      </div>
    </li>
  )
}

function Summary({ lines }: { lines: CartLine[] }) {
  const total = totalPrice(lines)
  const missing = FREE_SHIPPING_FROM - total

  return (
    <div className="border-t border-line bg-ink-raised p-4">
      <p className="mb-3 text-sm text-mute">
        {missing > 0
          ? `${euro(missing)} to go for free shipping.`
          : 'Free shipping — you are over €50.'}
      </p>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-bold">Subtotal</span>
        <span className="text-2xl font-black tracking-tight">
          <span data-vat="incl">{euro(total)}</span>
          <span data-vat="excl">{euro(excludingVat(total))}</span>
        </span>
      </div>
      <p className="mb-3 text-xs text-mute">
        <span data-vat="incl">Incl. 21% VAT, excl. shipping</span>
        <span data-vat="excl">Excl. 21% VAT and shipping</span>
      </p>
      <button
        type="button"
        className="w-full rounded-xl bg-signal px-4 py-3 text-base font-extrabold text-ink shadow-card hover:bg-white"
      >
        To checkout
      </button>
      <p className="mt-3 text-center text-xs text-mute">
        Ordered before 23:00, delivered tomorrow · iDEAL, Klarna, credit card
      </p>
    </div>
  )
}

export function Cart() {
  const lines = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const count = totalItems(lines)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const drawer = document.getElementById('cart-drawer')
          if (drawer instanceof HTMLDialogElement) drawer.showModal()
        }}
        className="relative rounded-xl bg-ink-card px-3 py-2 text-sm font-bold shadow-card hover:bg-line"
      >
        Basket
        {count > 0 && (
          <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-signal text-xs font-black text-ink">
            {count}
          </span>
        )}
      </button>

      <dialog
        id="cart-drawer"
        aria-label="Shopping basket"
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-md bg-ink text-white shadow-lift backdrop:bg-black/60"
      >
        <div className="flex h-dvh flex-col">
          <div className="flex items-center justify-between border-b border-line p-4">
            <h2 className="text-xl font-black tracking-tight">
              Your basket{count > 0 ? ` (${count})` : ''}
            </h2>
            <button
              type="button"
              onClick={close}
              className="rounded-lg bg-ink-card px-3 py-1.5 text-sm font-bold text-mute hover:text-white"
            >
              Close
            </button>
          </div>

          {lines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-lg font-bold">Nothing in here yet.</p>
              <p className="text-sm text-mute">
                Protein, creatine, pre-workout. Start with the tub you will actually finish.
              </p>
              <button
                type="button"
                onClick={close}
                className="rounded-xl bg-signal px-4 py-2 font-extrabold text-ink"
              >
                Keep shopping
              </button>
            </div>
          ) : (
            <>
              <ul className="flex-1 space-y-3 overflow-y-auto p-4">
                {lines.map((line) => (
                  <Line key={line.slug} line={line} />
                ))}
              </ul>
              <Summary lines={lines} />
            </>
          )}
        </div>
      </dialog>
    </>
  )
}
