import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ["src/visualization/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/server/**", "@/orchestration/**", "@/config/**", "**/server/**", "**/orchestration/**", "**/config/**"],
          message: "Visualization must derive from state and events, not server adapters, orchestration, or environment configuration.",
        }],
      }],
    },
  },
  {
    // Three.js objects are mutated imperatively inside useFrame, outside React rendering.
    files: ["src/visualization/world/scene/**/*.tsx"],
    rules: { "react-hooks/immutability": "off" },
  },
  globalIgnores([".next/**", "out/**", "coverage/**", "next-env.d.ts"]),
]);
