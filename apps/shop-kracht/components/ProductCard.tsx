import Link from 'next/link'
import {
  decimal,
  discountPercent,
  euro,
  excludingVat,
  photoAlt,
  pricePerServing,
  type Product,
} from '../lib/catalog'
import { photoSrc } from '../lib/products'
import { AddToCart } from './AddToCart'
import { Price } from './Price'

export function Packshot({ product, className }: { product: Product; className?: string }) {
  const src = photoSrc(product)

  if (src === null) {
    // The Pure and single-ingredient tubs carry a plain printed label; everything else that is
    // missing a packshot says so rather than pretending.
    const plain = product.flavour === 'Unflavoured'
    return (
      <div
        className={`grid place-items-center bg-[radial-gradient(circle_at_50%_35%,#262626,#131313)] p-4 text-center ${className ?? ''}`}
      >
        <div>
          <span className="block text-2xl font-black tracking-tighter text-signal">KRACHT</span>
          <span className="mt-1 block text-xs font-bold">{product.name}</span>
          <span className="mt-0.5 block text-[11px] text-mute">
            {plain ? `${product.flavour} · ${product.size}` : 'packshot on its way'}
          </span>
        </div>
      </div>
    )
  }

  return (
    // biome-ignore lint/performance/noImgElement: local packshots, fixed box, no remote loader
    <img
      src={src}
      alt={photoAlt(product)}
      className={`bg-[#ededeb] object-cover ${className ?? ''}`}
    />
  )
}

export function ProductCard({ product }: { product: Product }) {
  const off = discountPercent(product)

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-ink-card shadow-card transition hover:shadow-lift">
      <Link href={`/product/${product.slug}`} className="relative block">
        <Packshot product={product} className="aspect-4/5 w-full" />
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {off !== null && (
            <span className="rounded-full bg-flag px-2 py-0.5 text-xs font-black text-white">
              −{off}%
            </span>
          )}
          {product.diet.includes('vegan') && (
            <span className="rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-bold text-signal">
              Vegan
            </span>
          )}
          {product.diet.includes('no sweeteners') && (
            <span className="rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-bold text-signal">
              No sweeteners
            </span>
          )}
        </div>
        {!product.inStock && (
          <span className="absolute top-2 right-2 rounded-full bg-ink/85 px-2 py-0.5 text-[11px] font-bold text-mute">
            Sold out
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <Link href={`/product/${product.slug}`} className="text-base leading-tight font-extrabold">
          {product.name}
        </Link>
        <p className="text-xs text-mute">
          {product.flavour} · {product.size}
        </p>
        <p className="flex items-center gap-1 text-xs text-mute">
          <span className="font-bold text-signal">★ {decimal(product.rating)}</span>
          <span>({product.reviews})</span>
        </p>

        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-2">
            <Price amount={product.price} className="text-xl font-black tracking-tight" />
            {product.compareAt !== null && (
              <span className="text-sm text-mute line-through">
                <span data-vat="incl">{euro(product.compareAt)}</span>
                <span data-vat="excl">{euro(excludingVat(product.compareAt))}</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-mute">{pricePerServing(product)} per serving</p>
        </div>

        {product.inStock ? (
          <AddToCart
            slug={product.slug}
            name={product.name}
            flavour={product.flavour}
            price={product.price}
            image={photoSrc(product)}
            label="In my basket"
            className="mt-2 w-full rounded-xl bg-signal px-3 py-2 text-sm font-extrabold text-ink transition hover:bg-white active:translate-y-px"
          />
        ) : (
          <span className="mt-2 block rounded-xl border border-line px-3 py-2 text-center text-sm font-bold text-mute">
            Sold out
          </span>
        )}
      </div>
    </article>
  )
}
