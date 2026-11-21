import { renderGenerativeUI, type GenerativeUILibrary } from '@assistant-ui/generative-ui/react'
import { fallbackTree } from '../generative-ui/fallback'
import { guardTree } from '../generative-ui/guard'
import { migrateUi } from '../generative-ui/migrate'
import { PriceHistoryContext } from '../generative-ui/priceHistoryContext'
import { renderLibrary } from '../generative-ui/renderLibrary'
import type { ItemResponse } from '../types'
import { RenderBoundary } from './RenderBoundary'

export const FALLBACK_NOTE = "Showing the saved content; the layout Muse sent couldn't be used."

type Props = { response: ItemResponse; library?: GenerativeUILibrary }

function Tree({ response, library = renderLibrary }: Props) {
  const { item } = response
  const migrated = migrateUi(item.ui)
  const guarded = migrated ? guardTree(migrated.root, library) : null
  const usedFallback = guarded === null
  const tree = guarded?.tree ?? guardTree(fallbackTree(item), library)?.tree
  return (
    <>
      {(usedFallback || item.uiStatus !== 'valid') && (
        <p role="status" className="text-sm text-muted-foreground mb-4">
          {FALLBACK_NOTE}
        </p>
      )}
      {renderGenerativeUI(tree, library, { status: 'done' })}
    </>
  )
}

export default function ItemRenderer({ response, library }: Props) {
  return (
    <PriceHistoryContext
      value={{ products: response.item.products, priceHistories: response.priceHistories }}
    >
      <RenderBoundary markdown={response.item.content.markdown}>
        <Tree response={response} library={library} />
      </RenderBoundary>
    </PriceHistoryContext>
  )
}
