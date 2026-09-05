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
    // Server code (has its own tsconfig)
    "server/**",
    "dist/**",
    // Sidecar packages / build output (not part of the Next app lint surface)
    "extras/**",
    "old/**",
    "desktop/**",
    "ide-extensions/**",
    "scripts/**",
    "cloudflare/**",
  ]),
  {
    // Pin React version so eslint-plugin-react skips auto-detect (broken on ESLint 10).
    // Safe with ESLint 9 as well; matches package.json react version.
    settings: {
      react: {
        version: "19.2.4",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      // React Compiler–oriented hooks rules — warn until codebase is cleaned up
      "react-hooks/immutability": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "react/no-unescaped-entities": "off",
      "react-compiler/react-compiler": "off",
      "prefer-const": "warn",
    },
  },
]);

export default eslintConfig;
