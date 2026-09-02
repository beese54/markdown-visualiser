import { useEffect, useRef } from 'react'

/**
 * Image viewer.
 *
 * A dialog that traps focus and restores it on close. That is not polish -
 * without it, closing the lightbox drops the reader's keyboard position back
 * to the top of the document, which in a long document means losing your
 * place entirely.
 */

interface LightboxProps {
  readonly src: string
  readonly alt: string
  readonly onClose: () => void
}

export function Lightbox({ src, alt, onClose }: LightboxProps) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const returnFocusTo = useRef<Element | null>(null)

  useEffect(() => {
    returnFocusTo.current = document.activeElement
    closeButton.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      // Only one focusable element, so Tab must simply stay on it rather
      // than escaping to the document behind the overlay.
      if (event.key === 'Tab') {
        event.preventDefault()
        closeButton.current?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (returnFocusTo.current instanceof HTMLElement) returnFocusTo.current.focus()
    }
  }, [onClose])

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt === '' ? 'Image' : alt}
      onClick={(e) => {
        // Clicking the backdrop closes; clicking the image itself does not.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button ref={closeButton} type="button" className="lightbox-close" onClick={onClose}>
        Close
        <span aria-hidden="true"> ✕</span>
      </button>

      <figure className="lightbox-figure">
        <img src={src} alt={alt} />
        {alt !== '' && <figcaption>{alt}</figcaption>}
      </figure>
    </div>
  )
}
