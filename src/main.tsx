import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

function removeLiteralPowerShellEscapes(root: ParentNode = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.nodeValue?.includes('`r`n')) {
      nodes.push(node)
    }
  }

  for (const node of nodes) {
    node.nodeValue = node.nodeValue?.replaceAll('`r`n', '') ?? ''
  }
}

removeLiteralPowerShellEscapes()

const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of Array.from(mutation.addedNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text
        if (textNode.nodeValue?.includes('`r`n')) {
          textNode.nodeValue = textNode.nodeValue.replaceAll('`r`n', '')
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        removeLiteralPowerShellEscapes(node as Element)
      }
    }
  }
})

observer.observe(document.body, { childList: true, subtree: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
