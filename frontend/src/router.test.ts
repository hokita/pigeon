import { describe, it, expect } from 'vitest'
import { parseRoute, routePath, type Route } from './router'

describe('parseRoute', () => {
  it.each<[string, string, Route]>([
    ['/', '', { page: 'feed' }],
    ['/', '?type=price-watch', { page: 'feed', type: 'price-watch' }],
    ['/', '?type=Bad%20Type', { page: 'feed' }],
    ['/items/i_0123456789abcdef0123', '', { page: 'item', id: 'i_0123456789abcdef0123' }],
    ['/items/bad', '', { page: 'feed' }],
    ['/nope', '', { page: 'feed' }],
  ])('%s%s', (path, search, route) => {
    expect(parseRoute(path, search)).toEqual(route)
  })

  it.each<Route>([
    { page: 'feed' },
    { page: 'feed', type: 'news' },
    { page: 'item', id: 'i_0123456789abcdef0123' },
  ])('routePath round-trips %j', (route) => {
    const url = new URL(routePath(route), 'http://x')
    expect(parseRoute(url.pathname, url.search)).toEqual(route)
  })
})
