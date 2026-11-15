import { renderGenerativeUI, type GenerativeUILibrary } from '@assistant-ui/generative-ui/react'
import { fallbackTree } from '../generative-ui/fallback'
import { guardTree } from '../generative-ui/guard'
import { migrateUi } from '../generative-ui/migrate'
import { PriceHistoryContext } from '../generative-ui/priceHistoryContext'
import { renderLibrary } from '../generative-ui/renderLibrary'
import type { ItemResponse } from '../types'
import { RenderBoundary } from './RenderBoundary'

export const FALLBACK_NOTE = "Showing the saved content; the layout Muse sent couldn't be used."

export default function ItemRenderer({
  response,
  library = renderLibrary,
}: {
  response: ItemResponse
  library?: GenerativeUILibrary
}) {
  const { item, priceHistories } = response
  const migrated = migrateUi(item.ui)
  const guarded = migrated ? guardTree(migrated.root, library) : null
  const usedFallback = guarded === null
  const tree = guarded?.tree ?? guardTree(fallbackTree(item), library)?.tree
  return (
    <PriceHistoryContext value={{ products: item.products, priceHistories }}>
      {(usedFallback || item.uiStatus !== 'valid') && (
        <p role="status" className="text-sm text-muted-foreground mb-4">
          {FALLBACK_NOTE}
        </p>
      )}
      <RenderBoundary markdown={item.content.markdown}>
        {renderGenerativeUI(tree, library, { status: 'done' })}
      </RenderBoundary>
    </PriceHistoryContext>
  )
}
