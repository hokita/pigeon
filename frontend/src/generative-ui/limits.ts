// The same values as backend/src/ui/limits.ts (design §6.3).
export const UI_LIMITS = {
  maxBytes: 200_000,
  maxNodes: 400,
  maxDepth: 12,
  maxImages: 30,
  maxUrlLength: 2048,
} as const
