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
  // function) still missed files needed at runtime. Root cause: tesseract.js
  // OCR work happens in a Node worker_thread, spawned dynamically at runtime
  // (new Worker(...)) rather than through a statically-visible import/require
  // — Next.js's build-time tracer has no way to see into that separate
  // module graph at all. First symptom: the worker script's own
  // require('..') (reaching tesseract.js's main entry) failed with "Cannot
  // find module '..'". Fixing that surfaced the same problem one level
  // deeper: the worker script also requires tesseract.js's own npm
  // dependencies directly (e.g. "Cannot find module 'bmp-js'"), which are
  // separate, sibling node_modules packages, not part of tesseract.js's own
  // directory. Since crashes in that worker thread aren't catchable from the
  // main request, the main thread's worker.recognize() call just hangs until
  // Vercel's hard 60s function timeout kills the whole request — which is
  // what surfaced to the user as a non-JSON "An error o..." response.
  // Force-including tesseract.js's entire runtime dependency tree (per its
  // package.json "dependencies") avoids finding the rest of these one crash
  // at a time. pdfjs-dist's wasm/ assets are a related but separate gap:
  // referenced by lib/ocr.ts as a plain string path (for pdf.js's wasmUrl
  // option), never through an actual require()/import() the tracer can see.
  outputFileTracingIncludes: {
    "/api/policies/upload/ocr-batch": [
      "node_modules/tesseract.js/**/*",
      "node_modules/bmp-js/**/*",
      "node_modules/idb-keyval/**/*",
      "node_modules/is-url/**/*",
      "node_modules/node-fetch/**/*",
      "node_modules/whatwg-url/**/*",
      "node_modules/tr46/**/*",
      "node_modules/webidl-conversions/**/*",
      "node_modules/opencollective-postinstall/**/*",
      "node_modules/regenerator-runtime/**/*",
      "node_modules/tesseract.js-core/**/*",
      "node_modules/wasm-feature-detect/**/*",
      "node_modules/zlibjs/**/*",
      "node_modules/pdfjs-dist/**/*",
    ],
  },
};

export default nextConfig;
