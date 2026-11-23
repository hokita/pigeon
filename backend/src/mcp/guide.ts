import { ALLOWED_TYPES, schemaLibrary, uiGuideSchema } from '../ui/library.js'
import { UI_LIMITS } from '../ui/limits.js'

export const GUIDE_EXAMPLES = {
  news: {
    schemaVersion: 1,
    root: {
      _type: 'Col',
      gap: 4,
      children: [
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
  digest: {
    schemaVersion: 1,
    root: {
      _type: 'Col',
      gap: 4,
      children: [
        {
          _type: 'Markdown',
          value:
            'Three stories today: a small model release, a price cut and a security fix you should apply.',
        },
        {
          _type: 'Table',
          columns: [
            { label: 'Category' },
            { label: 'Subject' },
            { label: 'Date' },
            { label: 'Point' },
          ],
          rows: [
            [
              'AI',
              'Lumen-7',
              'Nov 13',
              'A 7B model that matches last year’s 30B models on reasoning',
            ],
            ['Shopping', 'WH-2000', 'Nov 14', 'Down 17% to its lowest recorded price'],
            ['Security', 'Kestrel Router', 'Nov 15', 'Firmware 2.4.1 fixes a remote login bug'],
          ],
        },
        {
          _type: 'Tabs',
          label: 'Stories',
          tabs: ['Lumen-7', 'WH-2000', 'Kestrel Router'],
          children: [
            {
              _type: 'Card',
              children: [
                {
                  _type: 'Markdown',
                  value:
                    'Lumen-7 is a **7B** open model. It runs on one consumer GPU and scores close to much larger models on reasoning tests.',
                },
                {
                  _type: 'Row',
                  gap: 4,
                  children: [
                    { _type: 'Fact', label: 'Params', value: '7B' },
                    { _type: 'Fact', label: 'Context', value: '128k tokens' },
                  ],
                },
              ],
            },
            {
              _type: 'Card',
              children: [
                {
                  _type: 'Markdown',
                  value: 'The WH-2000 headphones dropped from ¥39,600 to ¥32,800 at two shops.',
                },
                {
                  _type: 'Fact',
                  label: 'Now',
                  value: '¥32,800',
                  delta: '-17.2%',
                  trend: 'down',
                },
              ],
            },
            {
              _type: 'Card',
              children: [
                {
                  _type: 'Markdown',
                  value:
                    'Firmware 2.4.1 closes a bug that let anyone on the internet reach the admin login.',
                },
              ],
            },
          ],
        },
        {
          _type: 'Alert',
          tone: 'warning',
          title: 'To act on',
          description: 'Update the Kestrel Router to firmware 2.4.1 today.',
        },
        {
          _type: 'Timeline',
          items: [
            { time: 'Nov 13', title: 'Lumen-7 released' },
            { time: 'Nov 14', title: 'WH-2000 price cut' },
            { time: 'Nov 15', title: 'Kestrel firmware 2.4.1' },
          ],
        },
        {
          _type: 'Alert',
          tone: 'info',
          title: "Muse's take",
          description:
            'The router fix is the only urgent item. Lumen-7 matters more in the long run: small models this good make local assistants practical, which is worth watching before buying new hardware. The headphone cut is real but not unusual for this season.',
        },
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
    '- Always send ui. If save_feed_item returns uiStatus "missing", call get_ui_guide and save again with the same dedupeKey and a ui.',
    '- If save_feed_item returns uiStatus "invalid", fix the listed issues and save again with the same dedupeKey.',
    "- Don't start the layout with a Header that repeats the title; the page already shows it.",
    '- Don\'t add inline source lines like "（出典：…）"; pigeon lists content.sources on the page.',
    "- Don't repeat a tab's name as a heading inside it.",
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
