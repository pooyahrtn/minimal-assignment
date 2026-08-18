'use client'

import { addLine } from '../lib/cart-store'

type Props = {
  slug: string
  name: string
  flavour: string
  price: number
  image: string | null
  label?: string
  className?: string
}

export function AddToCart({ slug, name, flavour, price, image, label, className }: Props) {
  function add() {
    addLine({ slug, name, flavour, price, image })
    const drawer = document.getElementById('cart-drawer')
    if (drawer instanceof HTMLDialogElement) drawer.showModal()
  }

  return (
    <button
      type="button"
      onClick={add}
      className={
        className ??
        'w-full rounded-xl bg-signal px-4 py-3 text-base font-extrabold text-ink shadow-card transition hover:bg-white active:translate-y-px'
      }
    >
      {label ?? 'In my basket'}
    </button>
  )
}
