import { render, screen, fireEvent, act } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { Route } from './router'

const { mockOnAuthStateChanged } = vi.hoisted(() => ({ mockOnAuthStateChanged: vi.fn() }))

vi.mock('firebase/auth', () => ({ onAuthStateChanged: mockOnAuthStateChanged }))
vi.mock('./firebase', () => ({ auth: {} }))
vi.mock('./pages/LoginPage', () => ({ default: () => <div>login page</div> }))
vi.mock('./pages/FeedPage', () => ({
  default: ({ type, navigate }: { type?: string; navigate: (r: Route) => void }) => (
    <div>
      feed page {type ?? 'all'}
      <button onClick={() => navigate({ page: 'item', id: 'i_0123456789abcdef0123' })}>open</button>
    </div>
  ),
}))
vi.mock('./pages/ItemPage', () => ({
  default: ({ id }: { id: string }) => <div>item page {id}</div>,
}))

import App from './App'

function signedIn() {
  mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
    callback({ uid: 'u1' })
    return () => {}
  })
}

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('renders nothing while auth state is unknown', () => {
    mockOnAuthStateChanged.mockImplementation(() => () => {})
    const { container } = render(<App />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows LoginPage when signed out', () => {
    mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(null)
      return () => {}
    })
    render(<App />)
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('shows the feed when signed in', () => {
    window.history.replaceState(null, '', '/?type=news')
    signedIn()
    render(<App />)
    expect(screen.getByText('feed page news')).toBeInTheDocument()
  })

  it('navigates to an item and follows back', () => {
    signedIn()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(window.location.pathname).toBe('/items/i_0123456789abcdef0123')
    expect(screen.getByText('item page i_0123456789abcdef0123')).toBeInTheDocument()
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByText('feed page all')).toBeInTheDocument()
  })
})
