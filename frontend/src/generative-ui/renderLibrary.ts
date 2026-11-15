import { z } from 'zod'
import type { GenerativeUILibrary } from '@assistant-ui/generative-ui/react'
import { pigeonLibrary } from './library'
import { Unsupported } from './Unsupported'

// Render-only: the guard's placeholder is never in pigeonLibrary, so no stored tree can name it.
export const renderLibrary: GenerativeUILibrary = {
  ...pigeonLibrary,
  Unsupported: {
    description: 'Placeholder for a part that could not be shown.',
    properties: z.object({}),
    render: Unsupported,
  },
}
