import { create } from 'zustand'

import type { DocumentSet } from '@/types/domain'
import { LIMITS, IngestError } from '@/types/domain'
import { revokeAssets } from '@/ingest/assets'
import { buildDocumentSet } from '@/ingest/docset'
import { stripCommonRoot, walkDataTransfer, walkFileList } from '@/ingest/walker'

export type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading'; readonly count: number }
  | { readonly kind: 'building' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly message: string; readonly code: string }

interface ReaderState {
  readonly phase: Phase
  readonly set: DocumentSet | null
  /** id of the document currently open. */
  readonly activeDocId: string | null

  ingestDataTransfer(dt: DataTransfer): Promise<void>
  ingestFileList(files: FileList): Promise<void>
  openDoc(docId: string): void
  reset(): void
}

export const useReader = create<ReaderState>((set, get) => {
  /** Object URLs are owned by the set; discarding one without revoking them
   *  leaks every image for the lifetime of the page. */
  const disposeCurrent = () => {
    const current = get().set
    if (current) revokeAssets(current.assets)
  }

  const ingest = async (
    collect: () => Promise<{ path: string; file: File }[]>,
  ): Promise<void> => {
    try {
      set({ phase: { kind: 'reading', count: 0 } })
      const walked = await collect()

      set({ phase: { kind: 'building' } })
      const { rootName, files } = stripCommonRoot(walked)
      const built = await buildDocumentSet(files, { rootName })

      disposeCurrent()
      set({
        set: built,
        activeDocId: built.docs[0]?.id ?? null,
        phase: { kind: 'ready' },
      })
    } catch (err) {
      set({
        phase: {
          kind: 'error',
          message:
            err instanceof IngestError || err instanceof Error
              ? err.message
              : 'Something went wrong reading those files.',
          code: err instanceof IngestError ? err.code : 'read-failed',
        },
      })
    }
  }

  return {
    phase: { kind: 'idle' },
    set: null,
    activeDocId: null,

    ingestDataTransfer: (dt) =>
      ingest(() =>
        walkDataTransfer(dt, {
          maxFiles: LIMITS.maxFiles,
          onProgress: (count) => set({ phase: { kind: 'reading', count } }),
        }),
      ),

    ingestFileList: (files) =>
      ingest(async () =>
        walkFileList(files, {
          maxFiles: LIMITS.maxFiles,
          onProgress: (count) => set({ phase: { kind: 'reading', count } }),
        }),
      ),

    openDoc: (docId) => set({ activeDocId: docId }),

    reset: () => {
      disposeCurrent()
      set({ phase: { kind: 'idle' }, set: null, activeDocId: null })
    },
  }
})
