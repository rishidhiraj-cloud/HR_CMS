import { definePDFJSModule, getDocumentProxy, renderPageAsImage } from 'unpdf'
import { createWorker } from 'tesseract.js'
import path from 'path'
import { pathToFileURL } from 'url'

let pdfjsModuleDefined = false

async function ensurePDFJSModule() {
  if (pdfjsModuleDefined) return
  // The bare `pdfjs-dist` (modern) build needs Uint8Array.prototype.toHex, a
  // V8 feature still gated behind an experimental flag on this Node version
  // — use the Node-targeted legacy build instead, as pdf.js's own runtime
  // warning recommends ("Please use the `legacy` build in Node.js
  // environments").
  await definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs'))
  pdfjsModuleDefined = true
}

// unpdf does not auto-resolve pdf.js's `wasmUrl` option (only
// `standardFontDataUrl`). Without it, pdf.js can't locate its JBig2 decoder
// assets and silently drops JBig2-compressed image content — the exact
// compression scanners commonly use for text pages — rendering it as
// near-blank. Resolved via require.resolve so it works regardless of the
// process's current working directory (unlike a plain `process.cwd()`
// join, which isn't reliable inside a bundled serverless function).
const PDFJS_WASM_URL = pathToFileURL(
  path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'wasm') + path.sep
).href

export async function getPageCount(pdfBuffer: Uint8Array): Promise<number> {
  await ensurePDFJSModule()
  const pdf = await getDocumentProxy(pdfBuffer, { wasmUrl: PDFJS_WASM_URL })
  return pdf.numPages
}

// pageIndex is 0-indexed (matches document_chunks.chunk_index convention);
// unpdf/pdf.js page numbers are 1-indexed, so we convert when calling renderPageAsImage.
export async function ocrPage(pdfBuffer: Uint8Array, pageIndex: number): Promise<string> {
  await ensurePDFJSModule()
  const pdf = await getDocumentProxy(pdfBuffer, { wasmUrl: PDFJS_WASM_URL })
  const imageBuffer = await renderPageAsImage(pdf, pageIndex + 1, {
    canvasImport: () => import('@napi-rs/canvas'),
    scale: 2,
  })

  const worker = await createWorker('eng')
  try {
    const { data: { text } } = await worker.recognize(Buffer.from(imageBuffer))
    return text
  } finally {
    await worker.terminate()
  }
}
