'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * GoatCounter page views: free, no cookies, no personal data. The site is a client-side app, so
 * the script's own on-load count is turned off and each route change is counted here instead.
 * Leave the code empty to turn counting off.
 */
export const GOATCOUNTER_CODE = 'xiaogao0616'
// Only the published site is counted, so local runs and Vercel previews don't inflate the numbers.
const COUNTED_HOST = 'xiaogao0616.github.io'

type GoatCounter = { no_onload?: boolean; count?: (vars: { path: string }) => void }
declare global { interface Window { goatcounter?: GoatCounter } }

export function Analytics() {
  const pathname = usePathname()
  useEffect(() => {
    if (!GOATCOUNTER_CODE || window.location.hostname !== COUNTED_HOST) return
    const count = () => window.goatcounter?.count?.({ path: window.location.pathname })
    if (document.getElementById('goatcounter-script')) { count(); return }
    window.goatcounter = { ...window.goatcounter, no_onload: true }
    const script = document.createElement('script')
    script.id = 'goatcounter-script'
    script.async = true
    script.src = 'https://gc.zgo.at/count.js'
    script.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`
    script.onload = count
    document.head.appendChild(script)
  }, [pathname])
  return null
}
