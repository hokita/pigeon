import { describe, it, expect } from 'vitest'
import { defaultGenerativeUILibrary } from '@assistant-ui/generative-ui/react'

describe('official vocabulary', () => {
  it('loads the official vocabulary under node', () => {
    expect(Object.keys(defaultGenerativeUILibrary)).toEqual(
      expect.arrayContaining([
        'Markdown',
        'Chart',
        'Timeline',
        'Citation',
        'Card',
        'Row',
        'Col',
        'Alert',
        'Table',
        'Image',
        'Header',
      ])
    )
  })
})
