# Credits

## Design — Meng To

**The entire visual design of this project derives from the work of
[Meng To](https://github.com/MengTo) ([@MengTo](https://twitter.com/MengTo),
[Design+Code](https://designcode.io)). Full credit for how this application
looks belongs to him.**

The archival-paper reading surface — the dark shell framing a warm parchment
sheet, the serif-led typographic hierarchy, the index-as-navigation, the drop
caps and folio markers, the restrained oxblood-and-gold accent palette — is a
direct implementation of design direction published in
[MengTo/Skills](https://github.com/MengTo/Skills).

Skills used, vendored into `.claude/skills/mengto/` by `init.sh`:

| Skill | What it gave this project |
|---|---|
| [`book-serif-index`](https://github.com/MengTo/Skills/tree/main/agent-skills/web-design/book-serif-index) | The core direction: two-zone composition, serif as the primary design driver, index-like navigation with active markers, drop caps and folio marks, the restrained dark-frame/warm-paper/muted-ink palette, and the instruction that motion stay "calm and literary" |
| [`light-mode-paper-technical`](https://github.com/MengTo/Skills/tree/main/agent-skills/web-design/light-mode-paper-technical) | Warm off-white surfaces instead of stark white, the darker shell framing a lighter interior, thin structural borders and hairlines, and the single restrained accent colour |
| [`beautiful-shadows`](https://github.com/MengTo/Skills/tree/main/agent-skills/web-design/beautiful-shadows) | Layered elevation — a tight contact shadow plus a wide ambient one — which is what makes the sheet read as resting on the frame rather than pasted onto it |
| [`scroll-progress-timeline`](https://github.com/MengTo/Skills/tree/main/agent-skills/web-design/scroll-progress-timeline) | The reading progress rail, and its reduced-motion behaviour |
| [`progressive-blur`](https://github.com/MengTo/Skills/tree/main/agent-skills/web-design/progressive-blur), [`masked-reveal`](https://github.com/MengTo/Skills/tree/main/agent-skills/web-design/masked-reveal), [`editorial-tech`](https://github.com/MengTo/Skills/tree/main/agent-skills/web-design/editorial-tech) | Surface treatment, reveal behaviour, and the mono utility-label typography in the frame |

`MengTo/Skills` is MIT licensed; a copy of that license travels with the
vendored skills at `.claude/skills/mengto/LICENSE`.

His other work is worth looking at directly — [`sketchbook`](https://github.com/MengTo/sketchbook),
[`kage`](https://github.com/MengTo/kage), [`threeui`](https://github.com/MengTo/threeui),
[`Spring`](https://github.com/MengTo/Spring) — and
[Design+Code](https://designcode.io) is where the thinking behind these comes
from.

### Scope of this project

This application exists for one narrow purpose: to help people read markdown
files in a neater, more legible way than a raw editor or a utilitarian preview
pane allows. It is a reader, not a design system, and it makes no claim on the
design ideas it borrows. Meng To's skills supplied the taste; everything here
is an implementation of that direction applied to markdown.

---

## Typography

All three families are self-hosted under the SIL Open Font License, so the app
makes no third-party requests.

| Font | By | License |
|---|---|---|
| [Fraunces](https://fonts.google.com/specimen/Fraunces) | Undercase Type (Phaedra Charles, Flavia Zimbardi) | SIL OFL 1.1 |
| [Newsreader](https://fonts.google.com/specimen/Newsreader) | Production Type | SIL OFL 1.1 |
| [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) | IBM / Mike Abbink, Bold Monday | SIL OFL 1.1 |

## Libraries

The markdown pipeline stands on the [unified](https://unifiedjs.com/)
collective's work — `remark`, `rehype`, and `hast-util-sanitize` in particular,
whose careful default schema is what the security model here builds on.

| Library | Role |
|---|---|
| [unified / remark / rehype](https://unifiedjs.com/) | the markdown pipeline |
| [`remark-github-blockquote-alert`](https://github.com/jaywcjlove/remark-github-blockquote-alert) | GitHub-style `> [!NOTE]` callouts |
| [KaTeX](https://katex.org/) | mathematics |
| [Shiki](https://shiki.style/) | syntax highlighting |
| [Mermaid](https://mermaid.js.org/) | diagrams |
| [React](https://react.dev/), [Vite](https://vite.dev/), [Zustand](https://zustand.docs.pmnd.rs/) | application shell |
| [Fastify](https://fastify.dev/), [Playwright](https://playwright.dev/) | the print service |
