import type { Route } from '../router'

// Placeholder until Task 17.
export default function FeedPage({ type }: { type?: string; navigate: (route: Route) => void }) {
  return <main>Feed {type}</main>
}
