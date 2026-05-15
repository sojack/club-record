import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/**
 * ESLint v9 flat config for the Club Record app.
 *
 * Next.js 16 removed the `next lint` command, and eslint-config-next 16 now
 * ships native flat-config arrays (no @eslint/eslintrc FlatCompat shim needed).
 * `npm run lint` invokes the ESLint CLI directly against this file.
 */
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

export default eslintConfig;
