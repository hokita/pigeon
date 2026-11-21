// Test-only: checks that the hosting CSP lets the built frontend reach its API.

type HostingHeaders = { hosting?: { headers?: { headers: { key: string; value: string }[] }[] } }

export function cspDirective(firebaseJson: string, directiveName: string): string[] {
  const { hosting } = JSON.parse(firebaseJson) as HostingHeaders
  const policy = hosting?.headers
    ?.flatMap((h) => h.headers)
    .find((h) => h.key.toLowerCase() === 'content-security-policy')?.value
  const directive = policy
    ?.split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([name]) => name === directiveName)
  return directive?.slice(1) ?? []
}

// Matches `VITE_API_URL: value` (YAML env) and `VITE_API_URL=value` (shell).
const API_URL = /VITE_API_URL['"]?\s*[:=]\s*['"]?([^\s'"#]+)/g

// Each problem as "<workflow>: <reason>". Origins must be listed exactly: a
// wildcard such as https://*.run.app would also allow other people's services.
export function apiOriginsMissingFromCsp(
  firebaseJson: string,
  workflows: { name: string; text: string }[]
): string[] {
  const allowed = cspDirective(firebaseJson, 'connect-src')
  return workflows.flatMap(({ name, text }) =>
    [...text.matchAll(API_URL)].flatMap(([, value]) => {
      if (!URL.canParse(value)) {
        return [`${name}: VITE_API_URL must be an inline URL so the CSP can be checked`]
      }
      const origin = new URL(value).origin
      return allowed.includes(origin) ? [] : [`${name}: ${origin} is not in connect-src`]
    })
  )
}
