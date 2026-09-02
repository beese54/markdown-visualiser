import { memo, type Ref } from 'react'

/**
 * The rendered document body.
 *
 * Memoised on the HTML string, and that is the whole point of the component
 * existing. The parent re-renders often - scroll progress, lightbox state,
 * navigation - and each of those re-renders was re-applying
 * `dangerouslySetInnerHTML`, replacing the entire prose subtree. Anything
 * holding a reference into that subtree (a Mermaid slot mid-render, say) was
 * left writing into a detached node, so the diagram silently never appeared.
 *
 * With the memo, the subtree is rebuilt only when the document actually
 * changes, which is the only time it should be.
 */
export const Prose = memo(function Prose({
  html,
  rootRef,
}: {
  readonly html: string
  readonly rootRef: Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={rootRef}
      className="prose"
      // Sanitised upstream at the pipeline's trust boundary.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
