import { describe, it, expect } from 'vitest'
import { GUIDE_EXAMPLES } from './guide.js'
import { validateUiTree } from '../ui/validate.js'

describe('get_ui_guide examples', () => {
  it.each(Object.entries(GUIDE_EXAMPLES))('the %s example is a valid tree', (_name, tree) => {
    expect(validateUiTree(tree)).toMatchObject({ ok: true })
  })
})
