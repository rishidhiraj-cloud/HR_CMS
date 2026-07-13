import { definePDFJSModule, getDocumentProxy, renderPageAsImage } from 'unpdf'
import { createWorker } from 'tesseract.js'

let pdfjsModuleDefined = false

async function ensurePDFJSModule() {
  if (pdfjsModuleDefined) return
  await definePDFJSModule(() => import('pdfjs-dist'))
  pdfjsModuleDefined = true
}

export async function getPageCount(pdfBuffer: Uint8Array): Promise<number> {
  await ensurePDFJSModule()
  const pdf = await getDocumentProxy(pdfBuffer)
  return pdf.numPages
}

// pageIndex is 0-indexed (matches document_chunks.chunk_index convention);
// unpdf/pdf.js page numbers are 1-indexed, so we convert when calling renderPageAsImage.
export async function ocrPage(pdfBuffer: Uint8Array, pageIndex: number): Promise<string> {
  await ensurePDFJSModule()
  const pdf = await getDocumentProxy(pdfBuffer)
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
