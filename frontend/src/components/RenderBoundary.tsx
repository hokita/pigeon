import { Component, type ReactNode } from 'react'
import { Markdown } from '../generative-ui/Markdown'

type Props = { markdown: string; children: ReactNode }

export class RenderBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <Markdown value={this.props.markdown} /> : this.props.children
  }
}
