# ADR-004: Composite string sort key for reading order

## Status

Accepted

## Context

A dropped folder has no defined order. Authors use frontmatter `order`, numeric prefixes, `README`/`index` files and nested directories.

## Options Considered

- A cascade of comparator functions.
- One composite string key per document, sorted with a plain string compare.

## Decision

Each document gets a dot-joined key: `dirRank.explicitOrder.indexRank.numericPrefix.naturalName`. Numbers are zero-padded. Missing values sort last within their rank. Ties break on path.

## Rationale

From `src/ingest/ordering.ts`: this makes ordering deterministic and easy to test, stable under equal keys, and a bug is visible by printing the key. Index names outrank numeric prefixes so a folder opens on its README rather than below its chapters.

## Consequences

- Precedence is fixed by the key layout, so changing it means editing `computeSortKey`.
- Numbers are padded to eight digits, and out-of-range values are not handled: uncertain — verify with developer.
- Sorting uses `localeCompare` on the key.

## Related Components

`src/ingest/ordering.ts`, `tests/unit/ordering.test.ts`, [DATA_MODEL.md](../DATA_MODEL.md)

<!-- sources: src/ingest/ordering.ts, src/ingest/docset.ts -->
