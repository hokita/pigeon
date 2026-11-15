import { z } from 'zod'
import {
  defaultGenerativeUILibrary as official,
  type GenerativeUILibrary,
} from '@assistant-ui/generative-ui/react'
import { Markdown } from './Markdown'
import { safeImageUrl } from './safeUrl'
import { PriceHistory } from './PriceHistory'

// Schema v1 allowlist (design §6.2), the same list as backend/src/ui/library.ts.
export const ALLOWED_TYPES = [
  'Col',
  'Row',
  'Card',
  'Tabs',
  'Header',
  'Text',
  'Caption',
  'Markdown',
  'Image',
  'Divider',
  'Table',
  'Chart',
  'Timeline',
  'Steps',
  'Alert',
  'Citation',
  'Fact',
  'Badge',
  'PriceHistory',
] as const

const lib = official as GenerativeUILibrary
const cardShape = (lib.Card.properties as unknown as z.ZodObject).shape

const officialTypes = ALLOWED_TYPES.filter(
  (t) => t !== 'Card' && t !== 'Image' && t !== 'Markdown' && t !== 'PriceHistory' && t !== 'Table'
)

export const pigeonLibrary: GenerativeUILibrary = {
  ...Object.fromEntries(officialTypes.map((t) => [t, lib[t]])),
  // Only title and padding reach the official Card (no background, form or buttons).
  Card: {
    ...lib.Card,
    properties: z.strictObject({ title: cardShape.title, padding: cardShape.padding }),
    render: ({ title, padding, children, $status }) =>
      lib.Card.render({ title, padding, children, $status } as never),
  } as GenerativeUILibrary[string],
  // Wide tables scroll inside their own container, never the page (design §8).
  Table: {
    ...lib.Table,
    render: (props) => (
      <div className="overflow-x-auto max-w-full">{lib.Table.render(props as never)}</div>
    ),
  } as GenerativeUILibrary[string],
  Image: {
    ...lib.Image,
    render: (props) =>
      safeImageUrl(props.src) ? (
        lib.Image.render(props as never)
      ) : (
        <span data-aui="image-blocked">{props.alt}</span>
      ),
  } as GenerativeUILibrary[string],
  Markdown: {
    ...lib.Markdown,
    streamProperties: false,
    render: ({ value }: { value: string }) => <Markdown value={value} />,
  } as GenerativeUILibrary[string],
  PriceHistory: {
    description: "A line chart of one product's price history, drawn from recorded observations.",
    properties: z.strictObject({
      product: z.string().min(1).max(2048),
      title: z.string().max(200).optional(),
    }),
    render: ({ product, title }: { product: string; title?: string }) => (
      <PriceHistory product={product} title={title} />
    ),
  } as GenerativeUILibrary[string],
}
