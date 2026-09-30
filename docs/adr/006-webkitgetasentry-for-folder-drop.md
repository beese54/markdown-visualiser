# ADR-006: Use webkitGetAsEntry for folder drops

## Status

Accepted

## Context

The app must accept dropped folders in the major browsers.

## Options Considered

- `DataTransferItem.getAsFileSystemHandle()` (File System Access API).
- `DataTransferItem.webkitGetAsEntry()`.
- A `webkitdirectory` file input only.

## Decision

Use `webkitGetAsEntry()` for drops, with a `webkitdirectory` file list (`walkFileList`) and flat `getAsFile()` as fallbacks.

## Rationale

`src/ingest/walker.ts`: despite the prefix, the entry API is the only one implemented across Chrome, Firefox and Safari. The File System Access API is Chromium-only.

## Consequences

- `readEntries` returns batches, so it must be drained in a loop, or large folders are truncated.
- Entries must be captured synchronously, before the first `await`.
- The walk stops at the maximum file count.

## Related Components

`src/ingest/walker.ts`, `tests/unit/walker.test.ts`

<!-- sources: src/ingest/walker.ts -->
