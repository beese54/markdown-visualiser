/**
 * jsdom gaps that every browser we target implements natively.
 *
 * These are polyfills for the *test environment only*. Nothing here is
 * shipped, and production code must not be written to depend on it — if a
 * real browser lacks the API, that belongs in src/, not here.
 */

// jsdom does not implement Blob.text() / Blob.arrayBuffer().
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error('read failed'))
      reader.readAsText(this)
    })
  }

  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error ?? new Error('read failed'))
      reader.readAsArrayBuffer(this)
    })
  }
}

// jsdom does not implement object URLs.
if (typeof URL.createObjectURL !== 'function') {
  let counter = 0
  URL.createObjectURL = () => `blob:test/${++counter}`
  URL.revokeObjectURL = () => undefined
}
