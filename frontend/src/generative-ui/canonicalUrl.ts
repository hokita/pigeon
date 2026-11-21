const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'dclid',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  'ref',
  'ref_src',
  'ref_url',
  'referrer',
  'spm',
])

const isTracking = (name: string) => {
  const lower = name.toLowerCase()
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)
}

export function canonicalUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  url.protocol = 'https:'
  url.hash = ''
  url.hostname = url.hostname.replace(/^www\./, '')
  if (url.port === '443' || url.port === '80') url.port = ''
  for (const name of [...url.searchParams.keys()]) {
    if (isTracking(name)) url.searchParams.delete(name)
  }
  url.searchParams.sort()
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  }
  return url.toString()
}

type ProductRef = { productId: string; productKey?: string; url: string; canonicalUrl: string }

export function resolveProduct(ref: string, products: readonly ProductRef[]): string | undefined {
  const byKey = products.find((p) => p.productKey !== undefined && p.productKey === ref)
  if (byKey) return byKey.productId
  const byUrl = products.find((p) => p.url === ref)
  if (byUrl) return byUrl.productId
  const canonical = canonicalUrl(ref)
  return canonical ? products.find((p) => p.canonicalUrl === canonical)?.productId : undefined
}
