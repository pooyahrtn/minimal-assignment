import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AddToCart } from '../../../components/AddToCart'
import { Price } from '../../../components/Price'
import { Packshot, ProductCard } from '../../../components/ProductCard'
import {
  decimal,
  discountPercent,
  euro,
  excludingVat,
  photoAlt,
  pricePerServing,
  type Product,
  specs,
} from '../../../lib/catalog'
import {
  byCategory,
  findProduct,
  flavourSiblings,
  photoSrc,
  products,
  sizeSiblings,
} from '../../../lib/products'

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:4002'

type PageProps = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = findProduct(slug)
  if (product === undefined) return {}
  return {
    title: `${product.name} ${product.size} — ${product.flavour}`,
    description: product.short,
    alternates: { canonical: `/product/${product.slug}` },
  }
}

function structuredData(product: Product) {
  const image = photoSrc(product)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `KRACHT ${product.name} ${product.size} — ${product.flavour}`,
    description: product.description,
    sku: product.slug,
    image: image === null ? [] : [`${SITE}${image}`],
    brand: { '@type': 'Brand', name: 'KRACHT' },
    category: product.category,
    additionalProperty: specs(product).map((spec) => ({
      '@type': 'PropertyValue',
      name: spec.label,
      value: spec.value,
    })),
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: product.rating,
      reviewCount: product.reviews,
      bestRating: 5,
      worstRating: 1,
    },
    offers: {
      '@type': 'Offer',
      url: `${SITE}/product/${product.slug}`,
      price: product.price.toFixed(2),
      priceCurrency: 'EUR',
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      priceValidUntil: '2026-12-31',
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: product.price >= 50 ? '0.00' : '4.95',
          currency: 'EUR',
        },
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'NL' },
      },
    },
  }
}

function VariantLinks({ product }: { product: Product }) {
  const flavours = flavourSiblings(product)
  const sizes = sizeSiblings(product)

  return (
    <div className="space-y-4">
      {flavours.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-extrabold">Flavour</p>
          <div className="flex flex-wrap gap-2">
            {flavours.map((sibling) => (
              <Link
                key={sibling.slug}
                href={`/product/${sibling.slug}`}
                aria-current={sibling.slug === product.slug ? 'page' : undefined}
                className={
                  sibling.slug === product.slug
                    ? 'rounded-xl bg-signal px-3 py-2 text-sm font-bold text-ink'
                    : 'rounded-xl bg-ink-card px-3 py-2 text-sm font-bold text-mute shadow-card hover:text-white'
                }
              >
                {sibling.flavour}
                {!sibling.inStock && <span className="ml-1 text-[11px]">· sold out</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {sizes.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-extrabold">Size</p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-xl bg-signal px-3 py-2 text-sm font-bold text-ink">
              {product.size}
            </span>
            {sizes.map((sibling) => (
              <Link
                key={sibling.slug}
                href={`/product/${sibling.slug}`}
                className="rounded-xl bg-ink-card px-3 py-2 text-sm font-bold text-mute shadow-card hover:text-white"
              >
                {sibling.size}
                <span className="ml-1 text-[11px]">{euro(sibling.price)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BuyBox({ product }: { product: Product }) {
  const off = discountPercent(product)

  return (
    <div className="rounded-2xl bg-ink-card p-4 shadow-card">
      <div className="flex flex-wrap items-baseline gap-3">
        <Price amount={product.price} className="text-4xl font-black tracking-tighter" />
        {product.compareAt !== null && (
          <span className="text-xl text-mute line-through">
            <span data-vat="incl">{euro(product.compareAt)}</span>
            <span data-vat="excl">{euro(excludingVat(product.compareAt))}</span>
          </span>
        )}
        {off !== null && (
          <span className="rounded-full bg-flag px-2.5 py-1 text-sm font-black text-white">
            −{off}%
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-mute">
        <span data-vat="incl">Incl. 21% VAT</span>
        <span data-vat="excl">Excl. 21% VAT</span> · {pricePerServing(product)} per serving ·{' '}
        {product.servings} servings
      </p>

      {product.bulk.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-ink-sunk p-3 text-sm">
          {product.bulk.map((tier) => (
            <li key={tier.qty} className="flex justify-between">
              <span className="text-mute">From {tier.qty} pieces</span>
              <span className="font-bold text-signal">{euro(tier.price)} each</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-sm font-bold">
        {product.inStock ? (
          <span className="text-signal">In stock — ordered before 23:00, delivered tomorrow</span>
        ) : (
          <span className="text-flag">Sold out — back in about ten days</span>
        )}
      </p>

      <div className="mt-3">
        {product.inStock ? (
          <AddToCart
            slug={product.slug}
            name={product.name}
            flavour={product.flavour}
            price={product.price}
            image={photoSrc(product)}
          />
        ) : (
          <span className="block rounded-xl border border-line px-4 py-3 text-center font-bold text-mute">
            Sold out
          </span>
        )}
      </div>

      <ul className="mt-3 space-y-1 text-xs text-mute">
        <li>Free shipping over €50, otherwise €4,95</li>
        <li>iDEAL, Klarna, Riverty — pay in 14 days if you like</li>
        <li>30 days to send it back, opened or not</li>
      </ul>
    </div>
  )
}

function Accordions({ product }: { product: Product }) {
  return (
    <div className="mt-6 space-y-2">
      <details open className="rounded-xl bg-ink-card p-4 shadow-card">
        <summary className="cursor-pointer text-base font-extrabold">Specifications</summary>
        <dl className="mt-3 divide-y divide-line text-sm">
          {specs(product).map((spec) => (
            <div key={spec.label} className="flex justify-between gap-4 py-2">
              <dt className="text-mute">{spec.label}</dt>
              <dd className="text-right font-bold">{spec.value}</dd>
            </div>
          ))}
        </dl>
      </details>

      <details className="rounded-xl bg-ink-card p-4 shadow-card">
        <summary className="cursor-pointer text-base font-extrabold">How to use it</summary>
        <p className="mt-3 text-sm text-mute">{product.usage}</p>
      </details>

      <details className="rounded-xl bg-ink-card p-4 shadow-card">
        <summary className="cursor-pointer text-base font-extrabold">Shipping and returns</summary>
        <p className="mt-3 text-sm text-mute">
          Ordered before 23:00 on a working day, delivered the next day by PostNL. Free over €50,
          €4,95 below that. Not what you hoped for? Send it back within 30 days, opened tubs
          included — we would rather have the feedback than the tub.
        </p>
      </details>
    </div>
  )
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params
  const product = findProduct(slug)
  if (product === undefined) notFound()

  const related = byCategory(product.category)
    .filter((other) => other.line !== product.line)
    .slice(0, 4)

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-28 md:pb-10">
      <script type="application/ld+json">{JSON.stringify(structuredData(product))}</script>

      <nav className="mb-4 text-xs text-mute">
        <Link href="/" className="hover:text-signal">
          Home
        </Link>
        <span className="px-1">/</span>
        <Link href={`/#${product.category}`} className="hover:text-signal">
          {product.category}
        </Link>
        <span className="px-1">/</span>
        <span className="text-white">
          {product.name} {product.size}
        </span>
      </nav>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="relative overflow-hidden rounded-2xl shadow-lift">
            <Packshot product={product} className="aspect-4/5 w-full" />
            {!product.inStock && (
              <span className="absolute top-3 left-3 rounded-full bg-ink/85 px-3 py-1 text-xs font-bold text-mute">
                Sold out
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-mute">
            {photoSrc(product) === null && product.flavour !== 'Unflavoured'
              ? 'We have not shot this one yet. The tub is the same as the rest of the line.'
              : photoAlt(product)}
          </p>
        </div>

        <div>
          <p className="text-xs font-bold text-signal">{product.line}</p>
          <h1 className="mt-1 text-4xl leading-[0.95] font-black tracking-tighter md:text-5xl">
            {product.name}
          </h1>
          <p className="mt-2 text-base text-mute">
            {product.flavour} · {product.size} · {product.servings} servings
            {product.proteinPerServing !== null && ` · ${product.proteinPerServing} protein`}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <span className="font-bold text-signal">★ {decimal(product.rating)}</span>
            <span className="text-mute">
              from {product.reviews} {product.reviews === 1 ? 'review' : 'reviews'}
            </span>
          </p>
          {product.diet.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {product.diet.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-ink-card px-2.5 py-1 text-[11px] font-bold text-signal shadow-card"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p className="mt-4 text-base">{product.short}</p>

          <div className="mt-5 space-y-5">
            <VariantLinks product={product} />
            <BuyBox product={product} />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-black tracking-tight">What it is</h2>
          <p className="mt-3 text-base leading-relaxed text-mute">{product.description}</p>
        </div>
        <Accordions product={product} />
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-black tracking-tight">Goes with this</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {related.map((other) => (
              <ProductCard key={other.slug} product={other} />
            ))}
          </div>
        </section>
      )}

      {/* Sticky buy bar — the thing every Dutch webshop puts on a phone PDP. */}
      <div
        data-buybar
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink-raised/95 px-4 py-3 backdrop-blur md:hidden"
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {product.name} · {product.flavour}
            </p>
            <Price amount={product.price} className="text-lg font-black tracking-tight" />
          </div>
          <div className="ml-auto w-40">
            {product.inStock ? (
              <AddToCart
                slug={product.slug}
                name={product.name}
                flavour={product.flavour}
                price={product.price}
                image={photoSrc(product)}
                label="In my basket"
                className="w-full rounded-xl bg-signal px-3 py-2.5 text-sm font-extrabold text-ink shadow-card"
              />
            ) : (
              <span className="block rounded-xl border border-line px-3 py-2.5 text-center text-sm font-bold text-mute">
                Sold out
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
