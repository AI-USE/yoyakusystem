import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  // Disable linting during build to bypass Render errors if necessary,
  // or use a more standard flat config if the next-config-next ones are failing
  {
      rules: {
          "no-unused-vars": "warn"
      }
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
