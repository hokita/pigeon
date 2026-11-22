import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { apiOriginsMissingFromCsp, cspDirective } from './testing/cspRule'

const firebaseJson = readFileSync('../firebase.json', 'utf8')
const workflows = readdirSync('../.github/workflows')
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, text: readFileSync(`../.github/workflows/${name}`, 'utf8') }))

const csp = (connectSrc: string) =>
  JSON.stringify({
    hosting: {
      headers: [
        {
          source: '**',
          headers: [
            {
              key: 'Content-Security-Policy',
              value: `default-src 'self'; connect-src ${connectSrc}; object-src 'none'`,
            },
          ],
        },
      ],
    },
  })

const workflow = (text: string) => [{ name: 'frontend.yml', text }]
const RUN = 'https://pigeon-backend-abc123-an.a.run.app'

describe('apiOriginsMissingFromCsp', () => {
  it('passes when no workflow sets VITE_API_URL', () => {
    expect(apiOriginsMissingFromCsp(csp("'self'"), workflow('run: npm run build'))).toEqual([])
  })

  it('passes when the API origin is in connect-src', () => {
    const wf = workflow(`env:\n  VITE_API_URL: ${RUN}\n`)
    expect(apiOriginsMissingFromCsp(csp(`'self' ${RUN}`), wf)).toEqual([])
  })

  it('reports an API origin missing from connect-src', () => {
    const wf = workflow(`env:\n  VITE_API_URL: '${RUN}'\n`)
    expect(apiOriginsMissingFromCsp(csp("'self' https://*.googleapis.com"), wf)).toEqual([
      `frontend.yml: ${RUN} is not in connect-src`,
    ])
  })

  it('compares origins, not full URLs', () => {
    const wf = workflow(`run: VITE_API_URL="${RUN}/" npm run build`)
    expect(apiOriginsMissingFromCsp(csp(`'self' ${RUN}`), wf)).toEqual([])
  })

  it('does not accept a wildcard for the API origin', () => {
    const wf = workflow(`env:\n  VITE_API_URL: ${RUN}\n`)
    expect(apiOriginsMissingFromCsp(csp("'self' https://*.run.app"), wf)).toEqual([
      `frontend.yml: ${RUN} is not in connect-src`,
    ])
  })

  it('reports a VITE_API_URL it cannot check', () => {
    const wf = workflow('env:\n  VITE_API_URL: ${{ vars.API_URL }}\n')
    expect(apiOriginsMissingFromCsp(csp("'self'"), wf)).toEqual([
      'frontend.yml: VITE_API_URL must be an inline URL so the CSP can be checked',
    ])
  })
})

describe('hosting CSP', () => {
  it('allows every VITE_API_URL a workflow builds with', () => {
    expect(apiOriginsMissingFromCsp(firebaseJson, workflows)).toEqual([])
  })

  it('allows no local development hosts', () => {
    expect(
      cspDirective(firebaseJson, 'connect-src').filter((s) => /localhost|127\.0\.0\.1/.test(s))
    ).toEqual([])
  })

  it('frames only the project auth domain', () => {
    expect(cspDirective(firebaseJson, 'frame-src')).toEqual([
      'https://pigeon-d6e3b8.firebaseapp.com',
    ])
  })
})

describe('cspDirective', () => {
  it('returns the sources of one directive', () => {
    expect(cspDirective(csp("'self' https://a.example"), 'connect-src')).toEqual([
      "'self'",
      'https://a.example',
    ])
    expect(cspDirective(csp("'self'"), 'frame-src')).toEqual([])
  })
})
