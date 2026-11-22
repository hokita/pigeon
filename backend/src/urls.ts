import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { UI_LIMITS } from './ui/limits.js'

export const TRACKING_PARAMS: readonly string[] = [
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
]

const tracking = new Set(TRACKING_PARAMS)

export function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.startsWith('utm_') || tracking.has(lower)
}

function checkUrl(value: string, schemes: readonly string[]): string | null {
  if (value.length > UI_LIMITS.maxUrlLength) return `URL too long (max ${UI_LIMITS.maxUrlLength})`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'Invalid URL'
  }
  if (!schemes.includes(url.protocol))
    return `URL must use ${schemes.map((s) => s.slice(0, -1)).join(' or ')}`
  if (url.username || url.password) return 'URL must not contain credentials'
  const host = url.hostname
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.startsWith('[') ||
    isIP(host) !== 0 ||
    !host.includes('.')
  ) {
    return 'URL host must be a public domain name'
  }
  return null
}

export function checkLinkUrl(value: string): string | null {
  return checkUrl(value, ['http:', 'https:'])
}

export function checkImageUrl(value: string): string | null {
  return checkUrl(value, ['https:'])
}

export function canonicalUrl(value: string): string {
  if (checkLinkUrl(value) !== null) throw new Error('Invalid product URL')
  const url = new URL(value)
  url.protocol = 'https:'
  url.hash = ''
  url.hostname = url.hostname.replace(/^www\./, '')
  if (url.port === '443' || url.port === '80') url.port = ''
  for (const name of [...url.searchParams.keys()]) {
    if (isTrackingParam(name)) url.searchParams.delete(name)
  }
  url.searchParams.sort()
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  }
  return url.toString()
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export function productIdFor(p: { url: string; productKey?: string }): string {
  const identity = p.productKey ? `key:${p.productKey}` : `url:${canonicalUrl(p.url)}`
  return 'p_' + sha256(identity).slice(0, 20)
}
