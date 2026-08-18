import {
  amount,
  byHandle,
  categories,
  euro,
  inCategory,
  photoOf,
  type Product,
  products,
} from './catalog'

export const ORIGIN = 'http://localhost:4001'

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const PAYMENT = ['iDEAL', 'Klarna', 'Bancontact', 'Apple Pay', 'Visa', 'Mastercard']

const paymentMarks = (): string =>
  `<ul class="list-payment">${PAYMENT.map(
    (mark) => `<li class="list-payment__item">${esc(mark)}</li>`,
  ).join('')}</ul>`

const priceHtml = (product: Product): string => {
  if (product.compareAt === null) return `<span class="price">${euro(product.price)}</span>`
  return `<span class="price price--on-sale"><span class="price__was">${euro(
    product.compareAt,
  )}</span><span class="price__sale">${euro(product.price)}</span></span>`
}

const mediaHtml = (product: Product, sizes: string, eager = false): string => {
  const photo = photoOf(product)
  if (photo === null) {
    return `<div class="media media--placeholder"><span>Photograph to follow</span></div>`
  }
  return `<div class="media"><img src="${esc(photo.src)}" alt="${esc(
    photo.alt,
  )}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" sizes="${sizes}"></div>`
}

const badgeHtml = (product: Product): string => {
  if (!product.inStock) return '<div class="card__badge"><span class="badge">Sold out</span></div>'
  if (product.compareAt !== null) {
    return '<div class="card__badge"><span class="badge">Reduced</span></div>'
  }
  return ''
}

const card = (product: Product): string => `
<li class="grid__item">
  <div class="card-wrapper product-card-wrapper">
    <a class="card" href="/products/${product.handle}">
      <div class="card__inner">
        <div class="card__media">${mediaHtml(product, '(min-width: 750px) 25vw, 50vw')}</div>
        ${badgeHtml(product)}
      </div>
      <div class="card__content">
        <div class="card__information">
          <h3 class="card__heading">${esc(product.title)}</h3>
          <div class="card-information">
            <span class="card__colour">${esc(product.colour)}</span>
            ${priceHtml(product)}
          </div>
        </div>
      </div>
    </a>
  </div>
</li>`

const header = (): string => `
<div class="header-wrapper">
  <header class="header page-width">
    <a class="header__heading-link" href="/">Velde</a>
    <nav class="header__inline-menu">
      <ul class="list-menu list-menu--inline">
        ${categories
          .map(
            (group) =>
              `<li><a class="header__menu-item" href="/#${group.id}">${esc(group.title)}</a></li>`,
          )
          .join('')}
      </ul>
    </nav>
    <div class="header__icons">
      <a class="header__icon" href="#CartDrawer" data-cart-open>Bag (<span data-cart-count>0</span>)</a>
    </div>
  </header>
</div>`

const footer = (): string => `
<footer class="footer">
  <div class="footer__content-top page-width">
    <div>
      <p class="footer__wordmark">Velde</p>
      <p class="footer__blurb">Outerwear, knitwear and leather, made in Portugal, Italy and
        Scotland. Studio and archive on the Bilderdijkkade, Amsterdam.</p>
    </div>
    <div>
      <p class="footer__heading">Shop</p>
      <ul class="footer__list">
        ${categories
          .map((group) => `<li><a href="/#${group.id}">${esc(group.title)}</a></li>`)
          .join('')}
      </ul>
    </div>
    <div>
      <p class="footer__heading">Service</p>
      <ul class="footer__list">
        <li>Free shipping over €150</li>
        <li>14 days to decide</li>
        <li>Repairs and rewaxing</li>
        <li>hallo@velde.example</li>
      </ul>
    </div>
    <div>
      <p class="footer__heading">Payment</p>
      ${paymentMarks()}
    </div>
  </div>
  <div class="footer__content-bottom page-width">
    <p class="footer__copyright">© 2026 Velde B.V. · KVK 87451209 · BTW NL863421765B01</p>
    <p class="footer__copyright">Amsterdam</p>
  </div>
</footer>`

const cartDrawer = (): string => `
<aside id="CartDrawer" class="drawer" aria-label="Bag">
  <a class="drawer__overlay" href="#" aria-label="Close bag" tabindex="-1" data-cart-close></a>
  <div class="drawer__inner">
    <div class="drawer__header">
      <p class="drawer__heading">Your bag</p>
      <a class="drawer__close" href="#" data-cart-close>Close</a>
    </div>
    <div class="drawer__contents" data-cart-items>
      <p class="cart__empty">Your bag is empty.</p>
    </div>
    <div class="drawer__footer">
      <div class="totals">
        <span class="totals__subtotal">Subtotal</span>
        <span class="price" data-cart-total>€0.00</span>
      </div>
      <p class="drawer__note">Free shipping over €150. 14 days to decide.</p>
      <button class="button" type="button">Checkout</button>
      ${paymentMarks()}
    </div>
  </div>
</aside>`

const cookieBanner = (): string => `
<div class="cookie-banner" id="CookieBanner" role="region" aria-label="Cookie notice">
  <div class="cookie-banner__inner">
    <p class="cookie-banner__text">We use functional cookies to run the shop and, with your
      consent, analytics cookies to see which pieces people look at. You can change your mind at
      any time.</p>
    <div class="cookie-banner__actions">
      <button class="button button--secondary" type="button" data-cookie="essential">Essential only</button>
      <button class="button" type="button" data-cookie="all">Accept all</button>
    </div>
  </div>
</div>`

type Page = {
  title: string
  description: string
  path: string
  bodyClass: string
  head?: string
  main: string
  sticky?: string
}

export const layout = (page: Page): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${ORIGIN}${page.path}">
<meta property="og:site_name" content="VELDE">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${ORIGIN}${page.path}">
<link rel="stylesheet" href="/assets/velde.css">
${page.head ?? ''}
</head>
<body class="${page.bodyClass}">
<a class="skip-to-content-link visually-hidden" href="#MainContent">Skip to content</a>
<div class="announcement-bar"><p class="micro-label">Free shipping over €150 — 14 days to decide</p></div>
${header()}
<main id="MainContent">${page.main}</main>
${footer()}
${page.sticky ?? ''}
${cartDrawer()}
${cookieBanner()}
<script src="/assets/velde.js" defer></script>
<script src="http://localhost:4003/v1/agent.js" data-shop="velde" async></script>
</body>
</html>`

const collectionSection = (group: (typeof categories)[number]): string => {
  const items = inCategory(group.id)
  return `
<section class="collection page-width" id="${group.id}">
  <div class="collection__header">
    <h2 class="collection__title">${esc(group.title)}</h2>
    <p class="micro-label">${esc(group.note)} — ${items.length} pieces</p>
  </div>
  <ul class="grid product-grid">${items.map(card).join('')}</ul>
</section>`
}

export const homePage = (): string =>
  layout({
    title: 'VELDE — Outerwear, knitwear and leather. Amsterdam.',
    description:
      'VELDE makes outerwear, knitwear and leather in Portugal, Italy and Scotland. Free shipping over €150, 14 days to decide.',
    path: '/',
    bodyClass: 'template-index',
    main: `
<section class="section-hero page-width">
  <p class="micro-label">Autumn / Winter</p>
  <h1 class="hero__heading">Clothes that outlast the season you bought them in.</h1>
  <p class="hero__text">Nineteen pieces. Waxed cotton, merino, vegetable-tanned leather. Made in
    Portugal, Italy and Scotland, and cut to be repaired rather than replaced.</p>
  <a class="link-arrow" href="#outerwear">See the collection</a>
</section>
${categories.map(collectionSection).join('')}
<section class="section-services">
  <div class="services">
    <div class="services__item">
      <p class="micro-label">Shipping</p>
      <p>Free above €150 in the Netherlands and Belgium, €9 below it. Ordered before 22:00 on a
        weekday, sent the same day from Amsterdam.</p>
    </div>
    <div class="services__item">
      <p class="micro-label">Returns</p>
      <p>14 days to decide, from the day it arrives. Unworn, with the tags on, return label in the
        box.</p>
    </div>
    <div class="services__item">
      <p class="micro-label">Payment</p>
      ${paymentMarks()}
    </div>
  </div>
</section>`,
  })

const ratingHtml = (product: Product): string =>
  product.rating === null
    ? '<span class="rating">No reviews yet</span>'
    : `<span class="rating">${product.rating.value.toFixed(1)} / 5 — ${product.rating.count} reviews</span>`

const specRows = (product: Product): [string, string][] => [
  ['Material', product.specs.material],
  ['Fit', product.specs.fit],
  ['Made in', product.specs.madeIn],
  ['Care', product.specs.care],
]

const specList = (product: Product): string =>
  `<dl class="spec-list">${specRows(product)
    .map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`)
    .join('')}</dl>`

const addToCart = (product: Product, extraClass: string): string => {
  if (!product.inStock) {
    return `<button class="button ${extraClass}" type="button" disabled>Sold out</button>`
  }
  return `<form class="product-form" method="post" action="/cart/add">
    <input type="hidden" name="handle" value="${esc(product.handle)}">
    <button class="button ${extraClass}" type="submit">Add to bag</button>
  </form>`
}

const jsonLd = (product: Product): string => {
  const photo = photoOf(product)
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    sku: product.handle.toUpperCase(),
    color: product.colour,
    category: product.category,
    brand: { '@type': 'Brand', name: 'VELDE' },
    material: product.specs.material,
    additionalProperty: specRows(product).map(([label, value]) => ({
      '@type': 'PropertyValue',
      name: label,
      value,
    })),
    offers: {
      '@type': 'Offer',
      url: `${ORIGIN}/products/${product.handle}`,
      price: amount(product.price),
      priceCurrency: 'EUR',
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: { '@type': 'MonetaryAmount', value: '0.00', currency: 'EUR' },
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'NL' },
      },
    },
  }
  if (photo !== null) data.image = `${ORIGIN}${photo.src}`
  if (product.rating !== null) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating.value.toFixed(1),
      reviewCount: product.rating.count,
      bestRating: '5',
    }
  }
  return `<script type="application/ld+json">${JSON.stringify(data).replace(
    /</g,
    '\\u003c',
  )}</script>`
}

const productMain = (product: Product): string => `
<div class="page-width">
  <p class="breadcrumb micro-label"><a href="/">Velde</a> — <a href="/#${product.category}">${esc(
    product.category,
  )}</a></p>
  <div class="product">
    <div class="product__media-wrapper">${mediaHtml(product, '(min-width: 990px) 60vw, 100vw', true)}</div>
    <div class="product__info-wrapper">
      <section class="product__info-container">
        <p class="micro-label">${esc(product.category)} — ${esc(product.colour)}</p>
        <h1 class="product__title">${esc(product.title)}</h1>
        <div class="product__price-row">
          ${priceHtml(product)}
          ${ratingHtml(product)}
        </div>
        <p class="product__description">${esc(product.description)}</p>
        <div class="product-form__buttons">${addToCart(product, '')}</div>
        <ul class="product__delivery">
          <li>${product.price >= 15000 ? 'Free shipping — this piece is over €150' : 'Free shipping over €150, otherwise €9'}</li>
          <li>14 days to decide</li>
          <li>${product.inStock ? 'In stock, sent from Amsterdam within one working day' : 'Sold out — next run expected in six weeks'}</li>
        </ul>
        <div class="product__accordion accordion">
          <details open>
            <summary>Specifications</summary>
            <div class="accordion__content">${specList(product)}</div>
          </details>
          <details>
            <summary>Shipping and returns</summary>
            <div class="accordion__content">
              <p>Free above €150 in the Netherlands and Belgium, €9 below it. Rest of the EU €14,
                two to four working days. 14 days to decide from the day it arrives; unworn, tags
                on, label in the box.</p>
            </div>
          </details>
          <details>
            <summary>Payment</summary>
            <div class="accordion__content">
              <p>iDEAL, Bancontact, Apple Pay, card, or pay in three with Klarna.</p>
              ${paymentMarks()}
            </div>
          </details>
        </div>
      </section>
    </div>
  </div>
</div>`

const stickyBar = (product: Product): string => `
<div class="product-sticky">
  <div class="product-sticky__meta">
    <p class="product-sticky__title">${esc(product.title)}</p>
    ${priceHtml(product)}
  </div>
  ${addToCart(product, 'button--sticky')}
</div>`

export const productPage = (product: Product): string =>
  layout({
    title: `${product.title} — VELDE`,
    description: product.description,
    path: `/products/${product.handle}`,
    bodyClass: 'template-product',
    head: jsonLd(product),
    main: productMain(product),
    sticky: stickyBar(product),
  })

export const sitemap = (): string => {
  const urls = ['/', ...products.map((product) => `/products/${product.handle}`)]
  const entries = urls
    .map(
      (path) =>
        `  <url><loc>${ORIGIN}${path}</loc><changefreq>weekly</changefreq><priority>${
          path === '/' ? '1.0' : '0.8'
        }</priority></url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`
}

export const productBy = (handle: string): Product | undefined => byHandle.get(handle)
