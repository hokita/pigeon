import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.hoisted(() => ({
  currentUser: { getIdToken: vi.fn().mockResolvedValue('fake-token') } as {
    getIdToken: () => Promise<string>
  } | null,
}))
vi.mock('./firebase', () => ({ auth: mockAuth }))

import { api } from './api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
const signedInUser = mockAuth.currentUser

beforeEach(() => {
  mockFetch.mockReset()
  mockAuth.currentUser = signedInUser
  vi.stubEnv('VITE_API_URL', 'http://api.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

describe('api', () => {
  it('listItems sends the bearer token and type', async () => {
    mockFetch.mockResolvedValue(ok({ items: [], nextCursor: null }))
    const result = await api.listItems({ type: 'news', cursor: 'c1' })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api.test/api/items?type=news&cursor=c1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fake-token' }),
      })
    )
    expect(result).toEqual({ items: [], nextCursor: null })
  })

  it('listItems without filters calls /api/items', async () => {
    mockFetch.mockResolvedValue(ok({ items: [], nextCursor: null }))
    await api.listItems({})
    expect(mockFetch.mock.calls[0][0]).toBe('http://api.test/api/items')
  })

  it('listTypes returns the types array', async () => {
    mockFetch.mockResolvedValue(ok({ types: [{ type: 'news', count: 1, lastItemAt: 'x' }] }))
    expect(await api.listTypes()).toEqual([{ type: 'news', count: 1, lastItemAt: 'x' }])
    expect(mockFetch.mock.calls[0][0]).toBe('http://api.test/api/types')
  })

  it('getItem returns null on 404', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 })
    expect(await api.getItem('i_0123456789abcdef0123')).toBeNull()
  })

  it('throws on 500', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(api.getItem('i_0123456789abcdef0123')).rejects.toThrow('API error: 500')
    await expect(api.listItems({})).rejects.toThrow('API error: 500')
  })

  it('throws without calling fetch when signed out', async () => {
    mockAuth.currentUser = null
    await expect(api.listItems({})).rejects.toThrow('Not signed in')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('markRead POSTs with the bearer token', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('no body')
      },
    })
    await api.markRead('i_x')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api.test/api/items/i_x/read',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer fake-token' }),
      })
    )
  })

  it('markRead rejects on an error status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await expect(api.markRead('i_x')).rejects.toThrow('API error: 500')
  })

  it('listItems waits for a markRead still in flight', async () => {
    let finish: (v: unknown) => void = () => undefined
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r
        })
    )
    mockFetch.mockResolvedValue(ok({ items: [], nextCursor: null }))
    const marking = api.markRead('i_x')
    const listing = api.listItems({})
    await new Promise((r) => setTimeout(r, 0))
    expect(mockFetch).toHaveBeenCalledTimes(1)
    finish({ ok: true, status: 204, json: async () => ({}) })
    await marking
    await listing
    expect(mockFetch.mock.calls[1][0]).toBe('http://api.test/api/items')
  })

  it('a failed markRead does not block or fail listItems', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    mockFetch.mockResolvedValue(ok({ items: [], nextCursor: null }))
    const marking = api.markRead('i_x').catch(() => undefined)
    await expect(api.listItems({})).resolves.toEqual({ items: [], nextCursor: null })
    await marking
  })

  it('listItems stops waiting for a markRead that hangs after 2 seconds', async () => {
    vi.useFakeTimers()
    try {
      mockFetch.mockImplementationOnce(() => new Promise(() => undefined))
      mockFetch.mockResolvedValue(ok({ items: [], nextCursor: null }))
      void api.markRead('i_x').catch(() => undefined)
      const listing = api.listItems({})
      await vi.advanceTimersByTimeAsync(1999)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      await expect(listing).resolves.toEqual({ items: [], nextCursor: null })
      expect(mockFetch.mock.calls[1][0]).toBe('http://api.test/api/items')
    } finally {
      vi.useRealTimers()
    }
  })
})
