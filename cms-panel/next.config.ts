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
};

export default nextConfig;
