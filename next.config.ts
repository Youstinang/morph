import type { NextConfig } from "next";
import { parseEnvironment } from "./src/config/environment";

// Validate current configuration before development or production compilation.
// Never pass secret-bearing environment objects into Next.js's `env` option.
parseEnvironment(process.env);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Preserve the project's master-derived AGENTS.md without framework rewrites.
  agentRules: false,
  turbopack: { root: process.cwd() },
};

export default nextConfig;
