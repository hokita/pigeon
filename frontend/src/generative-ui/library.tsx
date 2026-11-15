import { z } from 'zod'
import {
  defaultGenerativeUILibrary as official,
  type GenerativeUILibrary,
} from '@assistant-ui/generative-ui/react'
import { Markdown } from './Markdown'
import { safeImageUrl } from './safeUrl'

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
  (t) => t !== 'Card' && t !== 'Image' && t !== 'Markdown' && t !== 'PriceHistory'
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
  // Replaced by the real component in Task 16.
  PriceHistory: {
    description: 'Price history drawn from recorded observations.',
    properties: z.strictObject({ product: z.string(), title: z.string().optional() }),
    render: () => null,
  },
}
