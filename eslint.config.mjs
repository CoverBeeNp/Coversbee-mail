import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase Edge Functions run on Deno, not Node — they use Deno globals
    // and https:// URL imports that this Next.js/Node lint config can't
    // resolve, and they're linted/type-checked separately via `deno lint`/
    // `deno check` (or `supabase functions serve`), not this project's tsc.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
