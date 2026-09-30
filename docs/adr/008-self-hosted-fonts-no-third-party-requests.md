# ADR-008: Self-hosted fonts and no third-party requests

## Status

Accepted

## Context

The HTML export must open correctly with the network disabled, and the print browser is forbidden from making any request.

## Options Considered

- Load fonts from a font CDN.
- Self-host fonts and bundle them.

## Decision

Fraunces, Newsreader and IBM Plex Mono are installed from `@fontsource/*` packages (SIL OFL) and served from the origin. The app makes no third-party requests.

## Rationale

The README ties self-hosting to offline HTML export. `definition_of_done.md` criterion 0.7 requires that `dist/` contains no `fonts.googleapis`/`gstatic` references. `src/export/standalone.ts` inlines fonts into the export.

## Consequences

- Fonts add to bundle and export size.
- New assets must also be same-origin, or the export will silently lose them (`collectCss` skips unreadable cross-origin sheets).

## Related Components

`src/styles/fonts.css`, `package.json`, `src/export/standalone.ts`

<!-- sources: README.md (previous version), definition_of_done.md, package.json, src/export/standalone.ts -->
