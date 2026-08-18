import Link from 'next/link'
import { Packshot, ProductCard } from '../components/ProductCard'
import { Price } from '../components/Price'
import {
  categories,
  decimal,
  discountPercent,
  euro,
  excludingVat,
  REVIEW_COUNT,
  REVIEW_SCORE,
} from '../lib/catalog'
import { byCategory, products } from '../lib/products'

const usps = [
  { title: 'Ordered before 23:00', body: 'Delivered tomorrow, Monday to Friday.' },
  { title: 'Free shipping over €50', body: 'Below that it is €4,95, PostNL.' },
  { title: 'Full doses, printed', body: '6 g citrulline is 6 g. No blends to hide behind.' },
  { title: '30 days to send it back', body: 'Opened tub, hated the flavour? Still fine.' },
]

function Hero() {
  const deal = products.find((product) => discountPercent(product) !== null)

  return (
    <section className="border-b border-line bg-[radial-gradient(120%_100%_at_15%_0%,#1f2410,#121212_60%)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1.1fr_0.9fr] md:py-16">
        <div>
          <p className="mb-3 inline-block rounded-full bg-ink-card px-3 py-1 text-xs font-bold text-signal shadow-card">
            Dutch made · third-party tested · since 2016
          </p>
          <h1 className="text-5xl leading-[0.95] font-black tracking-tighter md:text-7xl">
            Train hard.
            <br />
            <span className="text-signal">Eat properly.</span>
            <br />
            Skip the rest.
          </h1>
          <p className="mt-5 max-w-md text-base text-mute">
            Protein, creatine and pre-workout at doses that match the research, in sizes that last.
            No proprietary blends, no sixteen-ingredient labels, no promises we cannot print on the
            tub.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="#protein"
              className="rounded-xl bg-signal px-5 py-3 font-extrabold text-ink shadow-card hover:bg-white"
            >
              Shop protein
            </Link>
            <Link
              href="#creatine"
              className="rounded-xl border border-line px-5 py-3 font-extrabold hover:border-signal hover:text-signal"
            >
              Shop creatine
            </Link>
          </div>
          <p className="mt-5 flex flex-wrap items-center gap-3 text-sm text-mute">
            <span className="rounded-lg bg-ink-card px-2 py-1 text-lg font-black text-signal shadow-card">
              {decimal(REVIEW_SCORE)}
              <span className="text-xs text-mute">/10</span>
            </span>
            {REVIEW_COUNT.toLocaleString('nl-NL')} customers rated us. iDEAL, Klarna and pay later.
          </p>
        </div>

        {deal !== undefined && (
          <Link
            href={`/product/${deal.slug}`}
            className="flex flex-col justify-between rounded-2xl bg-ink-card p-4 shadow-lift"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-mute">Deal of the week</p>
                <p className="mt-1 text-2xl font-black tracking-tight">{deal.name}</p>
                <p className="text-sm text-mute">
                  {deal.flavour} · {deal.size}
                </p>
              </div>
              <span className="rounded-full bg-flag px-2.5 py-1 text-sm font-black text-white">
                −{discountPercent(deal)}%
              </span>
            </div>
            <Packshot product={deal} className="my-4 aspect-4/5 w-full rounded-xl" />
            <div className="flex items-baseline gap-3">
              <Price amount={deal.price} className="text-3xl font-black tracking-tight" />
              {deal.compareAt !== null && (
                <span className="text-lg text-mute line-through">
                  <span data-vat="incl">{euro(deal.compareAt)}</span>
                  <span data-vat="excl">{euro(excludingVat(deal.compareAt))}</span>
                </span>
              )}
            </div>
          </Link>
        )}
      </div>
    </section>
  )
}

export default function HomePage() {
  return (
    <>
      <Hero />

      <section className="border-b border-line bg-ink-raised">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {usps.map((usp) => (
            <div key={usp.title} className="rounded-xl bg-ink-card p-3 shadow-card">
              <p className="text-sm font-extrabold">{usp.title}</p>
              <p className="mt-1 text-xs text-mute">{usp.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        {categories.map((category) => (
          <section key={category.id} id={category.id} className="scroll-mt-20 pt-10">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-3xl font-black tracking-tight md:text-4xl">{category.label}</h2>
              <p className="text-sm text-mute">
                {category.blurb} · {byCategory(category.id).length} products
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {byCategory(category.id).map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mx-auto mt-14 max-w-6xl px-4">
        <div className="grid gap-4 rounded-2xl bg-ink-raised p-6 shadow-card md:grid-cols-3">
          <div>
            <p className="text-5xl font-black tracking-tighter text-signal">
              {decimal(REVIEW_SCORE)}
              <span className="text-xl text-mute">/10</span>
            </p>
            <p className="mt-2 text-sm text-mute">
              {REVIEW_COUNT.toLocaleString('nl-NL')} verified reviews, collected independently.
            </p>
          </div>
          <blockquote className="text-sm">
            <p className="font-bold">"Ordered at 22:40, at the door before nine."</p>
            <p className="mt-1 text-mute">Mees, Utrecht · 10/10</p>
          </blockquote>
          <blockquote className="text-sm">
            <p className="font-bold">"Unflavoured isolate that actually tastes of nothing."</p>
            <p className="mt-1 text-mute">Sanne, Rotterdam · 9/10</p>
          </blockquote>
        </div>
      </section>
    </>
  )
}
