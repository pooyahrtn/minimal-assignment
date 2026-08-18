/* Bag and cookie notice. Everything else on this site is server-rendered and works without it. */
;(() => {
  const BAG = 'velde:bag'
  const CONSENT = 'velde:consent'
  const drawer = document.getElementById('CartDrawer')
  const list = document.querySelector('[data-cart-items]')
  const total = document.querySelector('[data-cart-total]')
  const count = document.querySelector('[data-cart-count]')

  const money = (cents) => `€${(cents / 100).toFixed(2)}`

  const read = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(BAG) || '[]')
      return Array.isArray(raw) ? raw : []
    } catch {
      return []
    }
  }

  const write = (lines) => {
    localStorage.setItem(BAG, JSON.stringify(lines))
    paint(lines)
  }

  function paint(lines) {
    if (!list || !total || !count) return
    const units = lines.reduce((n, line) => n + line.qty, 0)
    count.textContent = String(units)
    total.textContent = money(lines.reduce((n, line) => n + line.price * line.qty, 0))
    if (lines.length === 0) {
      list.innerHTML = '<p class="cart__empty">Your bag is empty.</p>'
      return
    }
    list.innerHTML = lines
      .map(
        (line) => `<div class="cart-item">
          ${line.image ? `<img class="cart-item__image" src="${line.image}" alt="">` : '<span class="cart-item__image"></span>'}
          <div>
            <a class="cart-item__name" href="/products/${line.handle}">${line.title}</a>
            <p class="cart-item__meta">${line.colour} — ${line.qty} × ${money(line.price)}</p>
            <button class="cart-item__remove" type="button" data-remove="${line.handle}">Remove</button>
          </div>
        </div>`,
      )
      .join('')
  }

  const open = () => drawer?.classList.add('is-open')
  const close = () => {
    if (drawer) drawer.classList.remove('is-open')
    if (location.hash === '#CartDrawer') history.replaceState(null, '', location.pathname)
  }

  const lineFrom = (form) => {
    const page = document.querySelector('.product__info-container')
    const photo = document.querySelector('.product__media-wrapper img')
    const price = document.querySelector(
      '.product__price-row .price__sale, .product__price-row .price',
    )
    return {
      handle: form.querySelector('[name=handle]').value,
      title: page ? page.querySelector('.product__title').textContent.trim() : '',
      colour: page ? page.querySelector('.micro-label').textContent.split('—').pop().trim() : '',
      price: price ? Math.round(parseFloat(price.textContent.replace(/[^\d.]/g, '')) * 100) : 0,
      image: photo ? photo.getAttribute('src') : null,
      qty: 1,
    }
  }

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('.product-form')
    if (!form) return
    event.preventDefault()
    const line = lineFrom(form)
    const lines = read()
    const existing = lines.find((l) => l.handle === line.handle)
    if (existing) existing.qty += 1
    else lines.push(line)
    write(lines)
    open()
  })

  document.addEventListener('click', (event) => {
    const target = event.target
    if (target.closest('[data-cart-open]')) {
      event.preventDefault()
      open()
    }
    if (target.closest('[data-cart-close]')) {
      event.preventDefault()
      close()
    }
    const remove = target.closest('[data-remove]')
    if (remove) write(read().filter((line) => line.handle !== remove.dataset.remove))
    const consent = target.closest('[data-cookie]')
    if (consent) {
      localStorage.setItem(CONSENT, consent.dataset.cookie)
      const banner = document.getElementById('CookieBanner')
      if (banner) banner.hidden = true
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close()
  })

  const banner = document.getElementById('CookieBanner')
  if (banner && localStorage.getItem(CONSENT)) banner.hidden = true
  paint(read())
  if (location.hash === '#CartDrawer') open()
})()
