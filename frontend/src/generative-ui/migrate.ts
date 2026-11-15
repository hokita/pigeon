// Maps stored trees from older schema versions to the current one. v1 is the only
// version, so this is a check; anything else goes to the fallback (design §6.4).
export function migrateUi(ui: unknown): { schemaVersion: 1; root: unknown } | null {
  if (typeof ui !== 'object' || ui === null) return null
  const { schemaVersion, root } = ui as { schemaVersion?: unknown; root?: unknown }
  if (schemaVersion !== 1 || typeof root !== 'object' || root === null) return null
  return { schemaVersion: 1, root }
}
