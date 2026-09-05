import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";

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
    plugins: {
      "unused-imports": unusedImports,
    },
    // Pin React version so eslint-plugin-react skips auto-detect (broken on ESLint 10).
    settings: {
      react: {
        version: "19.2.4",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // Prefer unused-imports (autofixable) over the base unused-vars rule.
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-unused-expressions": "warn",
      // Large pages have intentional omitted deps; re-enable gradually per screen.
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "error",
      // React Compiler–oriented rules — off until a dedicated cleanup pass.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "@next/next/no-html-link-for-pages": "warn",
      // Branding / user-uploaded images use dynamic URLs — next/image is not always suitable.
      "@next/next/no-img-element": "off",
      "react/no-unescaped-entities": "off",
      "react-compiler/react-compiler": "off",
      "prefer-const": "warn",
    },
  },
]);

export default eslintConfig;
