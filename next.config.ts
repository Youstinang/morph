import type { NextConfig } from "next";
import { parseEnvironment } from "./src/config/environment";

// Validate current configuration before development or production compilation.
// Never pass secret-bearing environment objects into Next.js's `env` option.
parseEnvironment(process.env);

// Everything MORPH loads is its own (models, fonts, sound); the 3D loaders also use blob: and data: URLs, and
// the character models' mesh decoder is WebAssembly ('wasm-unsafe-eval' allows that without allowing eval).
// Inline scripts stay allowed because the static pages carry Next.js's inline bootstrap without a nonce.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' blob: data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Development keeps Next.js's own defaults: its hot reload needs eval and websockets.
  async headers() {
    return process.env.NODE_ENV === "production" ? [{ source: "/:path*", headers: SECURITY_HEADERS }] : [];
  },
  // Preserve the project's master-derived AGENTS.md without framework rewrites.
  agentRules: false,
  turbopack: { root: process.cwd() },
};

export default nextConfig;
