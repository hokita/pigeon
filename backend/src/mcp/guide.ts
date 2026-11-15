import { ALLOWED_TYPES, schemaLibrary, uiGuideSchema } from '../ui/library.js'
import { UI_LIMITS } from '../ui/limits.js'

// Small example trees shown to Muse. guide.test.ts checks they stay valid.
export const GUIDE_EXAMPLES = {
  news: {
    schemaVersion: 1,
    root: {
      _type: 'Col',
      gap: 4,
      children: [
        { _type: 'Header', text: 'Three new small models this week', size: 'xl' },
        {
          _type: 'Markdown',
          value: 'What the sources say, in your own words, with **key facts** in bold.',
        },
        {
          _type: 'Table',
          columns: [{ label: 'Model' }, { label: 'Params (B)', align: 'end' }],
          rows: [
            ['Lumen-7', 7],
            ['Kestrel Mini', 3],
          ],
        },
        { _type: 'Timeline', items: [{ time: 'Nov 13', title: 'Lumen-7 announced' }] },
        {
          _type: 'Alert',
          tone: 'info',
          title: "Muse's take",
          description: 'Your own analysis goes here.',
        },
      ],
    },
  },
  priceWatch: {
    schemaVersion: 1,
    root: {
      _type: 'Col',
      gap: 4,
      children: [
        { _type: 'Header', text: 'WH-2000 down to ¥32,800' },
        {
          _type: 'Row',
          gap: 4,
          children: [
            { _type: 'Fact', label: 'Now', value: '¥32,800' },
            {
              _type: 'Fact',
              label: 'List price',
              value: '¥39,600',
              delta: '-17.2%',
              trend: 'down',
            },
          ],
        },
        { _type: 'PriceHistory', product: 'sku:wh-2000', title: 'WH-2000' },
      ],
    },
  },
} as const

export function uiGuideText(existingTypes: string[]): string {
  const lib = schemaLibrary()
  const components = ALLOWED_TYPES.map((t) => `- ${t}: ${lib[t].description}`).join('\n')
  return [
    '# pigeon UI guide (schemaVersion 1)',
    '',
    'Send `ui` as { "schemaVersion": 1, "root": <node> }. A node is { "_type": "<Component>", ...props, "children"?: node | node[] | text }. Only Col, Row, Card and Tabs take children; Tabs takes one child per tab.',
    '',
    '## Rules',
    "- Never put past prices in a Chart; use PriceHistory with the product's productKey or url — pigeon draws it from recorded observations.",
    '- Prices are whole yen (JPY). Send productKey when the page shows a stable product code (SKU, JAN, model number).',
    '- Keep what the sources say and your own analysis in separate blocks. Put your analysis in an Alert titled "Muse\'s take".',
    "- You don't need Citation nodes: the page always lists content.sources.",
    '- Use only URLs you actually visited. Images must be https.',
    `- Item types already in use: ${existingTypes.length > 0 ? existingTypes.join(', ') : '(none yet)'}. Reuse one when it fits; otherwise pick a short lowercase slug.`,
    '- If save_feed_item returns uiStatus "invalid", fix the listed issues and save again with the same dedupeKey.',
    '',
    '## Limits',
    `- At most ${UI_LIMITS.maxNodes} nodes, ${UI_LIMITS.maxDepth} levels deep, ${UI_LIMITS.maxImages} images and ${UI_LIMITS.maxBytes} bytes of JSON.`,
    '- Header text ≤ 200 chars, Text/Caption ≤ 2,000, Markdown ≤ 20,000, Table ≤ 12 columns × 200 rows, Chart ≤ 366 points (≤ 5 series), Timeline ≤ 50 items, Steps ≤ 30, Tabs ≤ 8, Badge ≤ 40 chars.',
    '',
    '## Components',
    components,
    '',
    '## Examples',
    ...Object.entries(GUIDE_EXAMPLES).map(([name, tree]) => `### ${name}\n${JSON.stringify(tree)}`),
    '',
    '## JSON Schema for one node',
    JSON.stringify(uiGuideSchema()),
  ].join('\n')
}
