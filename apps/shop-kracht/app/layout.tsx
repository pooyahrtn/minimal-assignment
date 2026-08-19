import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Cart } from '../components/Cart'
import { CookieBar } from '../components/CookieBar'
import { VatToggle } from '../components/VatToggle'
import { categories, decimal, REVIEW_COUNT, REVIEW_SCORE } from '../lib/catalog'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:4002'),
  title: {
    default: 'KRACHT — protein, creatine and pre-workout, straight to your door',
    template: '%s | KRACHT',
  },
  description:
    'Dutch sports nutrition without the theatre. Full doses, honest labels, ordered before 23:00 and delivered tomorrow.',
}

const payments = ['iDEAL', 'Klarna', 'Riverty', 'Bancontact', 'Mastercard', 'VISA']

function TopBar() {
  return (
    <div className="bg-signal text-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-1.5 text-[12px] font-bold">
        <span>Free shipping over €50</span>
        <span className="hidden sm:inline">Ordered before 23:00, delivered tomorrow</span>
        <span>
          {decimal(REVIEW_SCORE)}/10 from {REVIEW_COUNT.toLocaleString('nl-NL')} reviews
        </span>
      </div>
    </div>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-2xl leading-none font-black tracking-tighter">
          KRACHT<span className="text-signal">.</span>
        </Link>
        <nav className="hidden items-center gap-4 text-sm font-bold md:flex">
          {categories.map((category) => (
            <Link key={category.id} href={`/#${category.id}`} className="hover:text-signal">
              {category.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <VatToggle />
          </div>
          <Cart />
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-ink-raised">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="text-2xl font-black tracking-tighter">
            KRACHT<span className="text-signal">.</span>
          </p>
          <p className="mt-2 max-w-sm text-sm text-mute">
            We sell three things and we dose them properly. No proprietary blends, no label tricks,
            no fairy dust. Order before 23:00 on a weekday and it is with you tomorrow.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {payments.map((payment) => (
              <span
                key={payment}
                className="rounded-lg bg-ink-card px-2.5 py-1 text-[11px] font-bold text-mute shadow-card"
              >
                {payment}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-3 text-sm font-extrabold">Shop</p>
          <ul className="space-y-2 text-sm text-mute">
            {categories.map((category) => (
              <li key={category.id}>
                <Link href={`/#${category.id}`} className="hover:text-signal">
                  {category.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-extrabold">Service</p>
          <ul className="space-y-2 text-sm text-mute">
            <li>hoi@kracht.nl</li>
            <li>Mon–Fri, 09:00–17:30</li>
            <li>Free shipping over €50</li>
            <li>30 days to send it back</li>
          </ul>
          <div className="mt-4 sm:hidden">
            <VatToggle />
          </div>
          <div className="mt-4 rounded-xl bg-ink-card p-3 shadow-card">
            <p className="text-2xl leading-none font-black text-signal">
              {decimal(REVIEW_SCORE)}
              <span className="text-base text-mute">/10</span>
            </p>
            <p className="mt-1 text-[11px] text-mute">
              {REVIEW_COUNT.toLocaleString('nl-NL')} verified reviews
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-[11px] text-mute md:flex-row md:items-center md:justify-between">
          <p>KRACHT Sports Nutrition B.V. · KvK 87451209 · BTW NL864129871B01</p>
          <p>
            All prices include 21% VAT unless you switch to excl. VAT. Food supplements are not a
            substitute for a varied diet.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopBar />
        <Header />
        <main>{children}</main>
        <Footer />
        <CookieBar />
        <script
          src={`${process.env.NEXT_PUBLIC_PLATFORM_ORIGIN ?? 'http://localhost:4003'}/v1/agent.js`}
          data-shop="kracht"
          async
        />
      </body>
    </html>
  )
}
