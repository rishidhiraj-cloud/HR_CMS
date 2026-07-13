import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas ships a platform-specific native .node binary and
  // resolves it at runtime via its own require() logic. Turbopack's default
  // Server Components bundling breaks that resolution ("Cannot find native
  // binding"), so it must run as plain Node require instead of being bundled.
  // tesseract.js has the same problem for a different reason: it locates its
  // own worker-script file via a runtime path that Turbopack rewrites into a
  // bogus "/ROOT/..." path when bundled, so it also needs to stay external.
  // pdfjs-dist is required directly (require.resolve('pdfjs-dist/package.json'),
  // to locate its WASM assets) — when bundled, Turbopack rewrites that
  // require.resolve() call into an internal numeric module ID instead of a
  // real file path ("path argument must be of type string. Received type
  // number"), so it must stay external too. unpdf does its own equivalent
  // resolve() call internally, so it needs to stay external for the same
  // reason.
  serverExternalPackages: ["@napi-rs/canvas", "tesseract.js", "pdfjs-dist", "unpdf"],

  // serverExternalPackages keeps these unbundled, but Next.js's file tracing
  // (which decides what actually gets copied into the deployed Vercel
  // function) still missed files at runtime that aren't reached via a
  // statically-traceable require()/import: tesseract.js's worker thread
  // script (src/worker-script/node/index.js) does `require('..')` to reach
  // the package's own main entry, and on Vercel that threw "Cannot find
  // module '..'" inside the worker thread — since that crash happens in a
  // separate thread, it's not a catchable error on the main request, so the
  // main thread's worker.recognize() call just hangs forever waiting on a
  // dead worker until Vercel's hard 60s function timeout kills the whole
  // request. pdfjs-dist's wasm/ assets are the same class of gap: they're
  // referenced by lib/ocr.ts as a plain string path (for pdf.js's wasmUrl
  // option), never through an actual require()/import() nft's tracer can
  // follow. Force-including both packages' full contents works around it.
  outputFileTracingIncludes: {
    "/api/policies/upload/ocr-batch": [
      "node_modules/tesseract.js/**/*",
      "node_modules/pdfjs-dist/**/*",
    ],
  },
};

export default nextConfig;
