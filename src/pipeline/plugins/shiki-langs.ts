import type { LanguageRegistration } from 'shiki/core'

/**
 * Language grammar loaders.
 *
 * Written as an explicit map of static `import()` calls rather than
 * `import(\`shiki/langs/${lang}.mjs\`)`. A template literal cannot be analysed
 * at build time, so Vite leaves it as a bare runtime specifier and the browser
 * fails with "Failed to resolve module specifier" the first time a code block
 * needs a grammar — which is exactly the bug this file exists to prevent.
 *
 * Each entry is still a separate `import()`, so every grammar remains its own
 * lazily fetched chunk. The map costs a line per language and buys correctness
 * without giving up code splitting.
 */

/**
 * What a `shiki/langs/*.mjs` dynamic import actually resolves to: a module
 * namespace whose default export is the grammar. Shiki's LanguageInput
 * accepts this shape directly, so no cast is needed at the call site.
 */
export type LangLoader = () => Promise<{ default: LanguageRegistration[] }>
export const LANG_LOADERS: Readonly<Record<string, LangLoader>> = {
  bash: () => import('shiki/langs/bash.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  docker: () => import('shiki/langs/docker.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  makefile: () => import('shiki/langs/makefile.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  nginx: () => import('shiki/langs/nginx.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  scala: () => import('shiki/langs/scala.mjs'),
  shellscript: () => import('shiki/langs/shellscript.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
}

/** Aliases authors actually write in fences. */
const ALIASES: Readonly<Record<string, string>> = {
  sh: 'bash',
  zsh: 'bash',
  shell: 'shellscript',
  console: 'shellscript',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  dockerfile: 'docker',
  htm: 'html',
  ps1: 'powershell',
  kt: 'kotlin',
  conf: 'ini',
  make: 'makefile',
}

/** Canonical grammar name for a fence label, or null if we cannot serve it. */
export function resolveLanguage(label: string): string | null {
  const lower = label.toLowerCase()
  const canonical = ALIASES[lower] ?? lower
  return canonical in LANG_LOADERS ? canonical : null
}

/**
 * Loaded eagerly with the highlighter. Deliberately small - these are the
 * languages a technical document set almost always contains, and each one
 * added here is weight every reader pays whether they need it or not.
 */
export const EAGER_LANGUAGES = [
  'bash',
  'json',
  'javascript',
  'typescript',
  'python',
  'yaml',
] as const
