import { LIMITS } from '@/types/domain'

/**
 * Client half of the PDF export.
 *
 * Posts the already-rendered, fully-inlined HTML and receives a PDF. The
 * server never sees markdown - it is a print service, not a second renderer -
 * which is what guarantees the PDF matches what was on screen.
 */

export class ExportTooLargeError extends Error {
  constructor(bytes: number) {
    super(
      `This export is ${(bytes / 1024 / 1024).toFixed(1)} MB, over the ` +
        `${LIMITS.pdfBodyLimitBytes / 1024 / 1024} MB limit. Try the ` +
        'self-contained HTML export instead.',
    )
    this.name = 'ExportTooLargeError'
  }
}

export interface PdfOptions {
  readonly html: string
  readonly title: string
  readonly format?: 'A4' | 'Letter'
}

export async function requestPdf({ html, title, format = 'A4' }: PdfOptions): Promise<Blob> {
  // Checked here as well as on the server: a clear message beats a 413.
  const bytes = new Blob([html]).size
  if (bytes > LIMITS.pdfBodyLimitBytes) throw new ExportTooLargeError(bytes)

  const response = await fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ html, title, format }),
  })

  if (!response.ok) {
    const message = await response
      .json()
      .then((body: unknown) =>
        typeof body === 'object' && body !== null && 'error' in body
          ? String((body as { error: unknown }).error)
          : null,
      )
      .catch(() => null)

    throw new Error(
      message ??
        (response.status === 413
          ? 'This export is too large for the print service.'
          : `The print service returned ${response.status}.`),
    )
  }

  return response.blob()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
