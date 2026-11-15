import { auth } from './firebase'
import type { FeedItemSummary, ItemResponse, ItemType } from './types'

class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API error: ${status}`)
  }
}

async function request<T>(path: string): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_URL
  if (!baseUrl) throw new Error('VITE_API_URL is not set')
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  const token = await user.getIdToken()
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new ApiError(res.status)
  return res.json()
}

export const api = {
  listItems: ({ type, cursor }: { type?: string; cursor?: string }) => {
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    if (cursor) params.set('cursor', cursor)
    const query = params.toString()
    return request<{ items: FeedItemSummary[]; nextCursor: string | null }>(
      `/api/items${query ? `?${query}` : ''}`
    )
  },
  listTypes: async () => (await request<{ types: ItemType[] }>('/api/types')).types,
  getItem: async (id: string): Promise<ItemResponse | null> => {
    try {
      return await request<ItemResponse>(`/api/items/${encodeURIComponent(id)}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  },
}
