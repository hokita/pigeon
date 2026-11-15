import { Component, type ReactNode } from 'react'
import { Markdown } from '../generative-ui/Markdown'

type Props = { markdown: string; children: ReactNode }

// Last line of defence: if rendering the tree throws past the per-element
// boundaries, show the saved Markdown with plain React instead.
export class RenderBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <Markdown value={this.props.markdown} /> : this.props.children
  }
}
