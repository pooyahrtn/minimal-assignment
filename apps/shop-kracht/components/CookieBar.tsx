'use client'

import { useEffect, useState } from 'react'

const KEY = 'kracht.consent.v1'

export function CookieBar() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(window.localStorage.getItem(KEY) === null)
  }, [])

  function decide(choice: 'all' | 'functional') {
    window.localStorage.setItem(KEY, choice)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink-raised/95 p-4 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center">
        <p className="flex-1 text-sm text-mute">
          <span className="font-bold text-white">Cookies.</span> We use functional cookies to keep
          your basket, and analytics and marketing cookies to see which products people actually
          buy. You choose.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide('functional')}
            className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-mute hover:text-white"
          >
            Functional only
          </button>
          <button
            type="button"
            onClick={() => decide('all')}
            className="rounded-xl bg-signal px-4 py-2 text-sm font-extrabold text-ink shadow-card"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  )
}
