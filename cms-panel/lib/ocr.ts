import { createIsomorphicCanvasFactory, getDocumentProxy, renderPageAsImage } from 'unpdf'
import { createWorker } from 'tesseract.js'
import { existsSync } from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

// Deliberately NOT overriding unpdf's pdf.js module via definePDFJSModule.
// unpdf ships its own self-contained pdf.js bundle (its `unpdf/pdfjs`
// subpath) with Node-compatible polyfills already applied (including
// Uint8Array.prototype.toHex, which the bare modern pdfjs-dist build lacks
// on this Node version) — the same bundle the pre-existing plain text
// extraction in app/api/policies/upload/route.ts already uses successfully.
// An earlier version of this file injected a separately-installed
// pdfjs-dist build instead; that build shares process-global mutable state
// (globalThis.pdfjsWorker) with unpdf's own bundle, and having two
// different pdf.js versions active in the same process caused
// "API version does not match the Worker version" crashes — including in
// the unrelated plain extraction path once both had run once. Using only
// unpdf's default resolution keeps a single consistent pdf.js version for
// every PDF operation in this app.

// unpdf does not auto-resolve pdf.js's `wasmUrl` option (only
// `standardFontDataUrl`). Without it, pdf.js can't locate its JBig2 decoder
// assets and silently drops JBig2-compressed image content — the exact
// compression scanners commonly use for text pages — rendering it as
// near-blank.
//
// Deliberately NOT using require.resolve() or import.meta.resolve() here:
// both get mangled by Turbopack's production bundler when the call site is
// in OUR OWN bundled code (this file), even with pdfjs-dist marked
// serverExternalPackages — that setting only stops Turbopack from bundling
// pdfjs-dist's own source, not from rewriting resolution calls made *about*
// it from app code. require.resolve() broke at build time ("path argument
// must be of type string, received type number" — a Turbopack-internal
// module ID substituted for the real path); import.meta.resolve() broke at
// runtime ("d.resolve is not a function" — Turbopack's import.meta shim
// doesn't implement it). A plain path.join() of string literals involves no
// resolution API call for the bundler to touch, so it survives bundling;
// serverExternalPackages guarantees pdfjs-dist stays a real, unbundled
// package under node_modules at runtime for this to find.
function getPdfjsWasmUrl(): string {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'wasm'),
    path.join(process.cwd(), '.next', 'server', 'node_modules', 'pdfjs-dist', 'wasm'),
  ]
  const dir = candidates.find(existsSync)
  if (!dir) {
    throw new Error(`Could not locate pdfjs-dist/wasm under any of: ${candidates.join(', ')}`)
  }
  return pathToFileURL(dir + path.sep).href
}

// Every getDocumentProxy() call gets its OWN COPY of the input buffer, never
// the caller's original array. pdf.js's Node "fake worker" message passing
// transfers/detaches the underlying ArrayBuffer the first time it's used
// (see https://github.com/unjs/unpdf/issues/17) — ocr-batch's route calls
// getPageCount(pdfBuffer) and then ocrPage(pdfBuffer, ...) with the SAME
// buffer object in the same request, and the second call fails with
// "Cannot transfer object of unsupported type" once the first has silently
// detached it. Copying defensively here means callers never need to know
// about this.
function copyBuffer(pdfBuffer: Uint8Array): Uint8Array {
  return new Uint8Array(pdfBuffer)
}

export async function getPageCount(pdfBuffer: Uint8Array): Promise<number> {
  const pdf = await getDocumentProxy(copyBuffer(pdfBuffer), { wasmUrl: getPdfjsWasmUrl() })
  const numPages = pdf.numPages
  // Every PDFDocumentProxy also owns a pdf.js worker (real or, in Node, a
  // fake loopback one) that must be explicitly destroyed — pdf.js does not
  // GC it automatically.
  await pdf.destroy()
  return numPages
}

// pageIndex is 0-indexed (matches document_chunks.chunk_index convention);
// unpdf/pdf.js page numbers are 1-indexed, so we convert when calling renderPageAsImage.
export async function ocrPage(pdfBuffer: Uint8Array, pageIndex: number): Promise<string> {
  // renderPageAsImage() only builds its own CanvasFactory for the final
  // render-target canvas. The document's *internal* canvas factory — used by
  // pdf.js's page-render pipeline to decode embedded image XObjects, which is
  // exactly what a scanned page's content is — is set once, at document
  // creation time, and is never touched if renderPageAsImage() is handed an
  // already-built PDFDocumentProxy (as we do below). Without passing
  // CanvasFactory here too, that internal decode step has no canvas
  // implementation at all and throws "@napi-rs/canvas is not available in
  // this environment" the moment it hits the page's embedded scan image.
  const canvasImport = () => import('@napi-rs/canvas')
  const CanvasFactory = await createIsomorphicCanvasFactory(canvasImport)
  const pdf = await getDocumentProxy(copyBuffer(pdfBuffer), { wasmUrl: getPdfjsWasmUrl(), CanvasFactory })
  const imageBuffer = await renderPageAsImage(pdf, pageIndex + 1, {
    canvasImport,
    scale: 2,
  })

  // Tesseract.js defaults its language-data cache path to '.' (the current
  // working directory) if not told otherwise. On Vercel, the deployed
  // function's filesystem is read-only except /tmp — writing eng.traineddata
  // to '.' would fail there. /tmp is also correct locally (just an unused,
  // harmless extra location instead of this package's own directory).
  const worker = await createWorker('eng', undefined, { cachePath: '/tmp' })
  try {
    const { data: { text } } = await worker.recognize(Buffer.from(imageBuffer))
    return text
  } finally {
    await worker.terminate()
    await pdf.destroy()
  }
}
