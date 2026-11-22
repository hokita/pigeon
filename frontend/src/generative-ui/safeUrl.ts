const MAX_URL_LENGTH = 2048
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

function safeUrl(value: unknown, schemes: readonly string[]): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return undefined
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (!schemes.includes(url.protocol) || url.username || url.password) return undefined
  const host = url.hostname
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.startsWith('[') ||
    IPV4.test(host) ||
    !host.includes('.')
  ) {
    return undefined
  }
  return value
}

export const safeLinkUrl = (value: unknown) => safeUrl(value, ['http:', 'https:'])
export const safeImageUrl = (value: unknown) => safeUrl(value, ['https:'])
