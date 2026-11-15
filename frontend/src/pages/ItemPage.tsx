import type { Route } from '../router'

// Placeholder until Task 18.
export default function ItemPage({ id }: { id: string; navigate: (route: Route) => void }) {
  return <main>Item {id}</main>
}
