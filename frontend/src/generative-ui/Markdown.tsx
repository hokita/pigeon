import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { safeImageUrl, safeLinkUrl } from './safeUrl'

const components: Components = {
  a: ({ href, children }) => {
    const safe = safeLinkUrl(href)
    if (!safe) return <span>{children}</span>
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    )
  },
  img: ({ src, alt }) => {
    const safe = safeImageUrl(src)
    if (!safe) return <span data-aui="image-blocked">{alt}</span>
    return <img src={safe} alt={alt ?? ''} referrerPolicy="no-referrer" loading="lazy" />
  },
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
}

export function Markdown({ value }: { value: string }) {
  return (
    <div
      data-aui="markdown"
      className="prose prose-neutral dark:prose-invert max-w-none break-words"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {value}
      </ReactMarkdown>
    </div>
  )
}
