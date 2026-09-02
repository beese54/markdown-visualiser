import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'dist-server/', 'node_modules/', '.claude/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Node-side code: the server, and the harness scripts that drive Chromium.
  // These legitimately use process/console and are not part of the bundle.
  //
  // The e2e drive is dual-context: the outer script is Node, but the bodies
  // passed to page.evaluate() are serialised and run inside the browser, so
  // both global sets are in scope within one file and the linter cannot tell
  // them apart.
  {
    files: ['server/**/*.ts', 'tests/e2e/**/*.mjs', '*.config.{ts,js}'],
    languageOptions: {
      globals: {
        // Node
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        // Browser, for page.evaluate() bodies
        document: 'readonly',
        window: 'readonly',
        location: 'readonly',
        performance: 'readonly',
        getComputedStyle: 'readonly',
        File: 'readonly',
        Event: 'readonly',
      },
    },
    rules: {
      // A CLI harness reports its results by printing them.
      'no-console': 'off',
    },
  },
)
