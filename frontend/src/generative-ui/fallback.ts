import type { FeedItemDetail } from '../types'

export function stripLeadingTitle(markdown: string, title: string): string {
  const [first, ...rest] = markdown.split('\n')
  if (first.trimEnd() !== `# ${title}`) return markdown
  const firstContent = rest.findIndex((line) => line.trim() !== '')
  return firstContent === -1 ? '' : rest.slice(firstContent).join('\n')
}

export function fallbackTree(item: FeedItemDetail): unknown {
  const markdown = stripLeadingTitle(item.content.markdown, item.title)
  return {
    $type: 'Col',
    gap: 4,
    children: [
      ...(markdown ? [{ $type: 'Markdown', value: markdown }] : []),
      ...item.products.map((p) => ({ $type: 'PriceHistory', product: p.productKey ?? p.url })),
    ],
  }
}
