import { Component, type ReactNode } from 'react'
import { stripLeadingTitle } from '../generative-ui/fallback'
import { Markdown } from '../generative-ui/Markdown'

type Props = { markdown: string; title: string; children: ReactNode }

export class RenderBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? (
      <Markdown value={stripLeadingTitle(this.props.markdown, this.props.title)} />
    ) : (
      this.props.children
    )
  }
}
