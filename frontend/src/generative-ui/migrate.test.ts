import { describe, it, expect } from 'vitest'
import { migrateUi } from './migrate'

describe('migrateUi', () => {
  it('migrateUi accepts 1, rejects 2 and garbage', () => {
    const ui = { schemaVersion: 1, root: { $type: 'Text', value: 'x' } }
    expect(migrateUi(ui)).toEqual(ui)
    expect(migrateUi({ schemaVersion: 2, root: {} })).toBeNull()
    expect(migrateUi(null)).toBeNull()
    expect(migrateUi('x')).toBeNull()
    expect(migrateUi({ schemaVersion: 1 })).toBeNull()
  })
})
