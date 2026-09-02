import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// KaTeX ships both an HTML rendering and a MathML copy of every formula; its
// stylesheet is what hides the MathML. Without it every equation is printed
// twice - once typeset, once as raw fallback text. Bundled from the package,
// so its fonts are served from this origin like the rest.
import 'katex/dist/katex.min.css'

import './styles/fonts.css'
import './styles/tokens.css'
import './styles/paper.css'

import { App } from './app/App'

const host = document.getElementById('root')
if (!host) throw new Error('Root element #root is missing from index.html')

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
