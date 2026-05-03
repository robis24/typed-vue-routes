import js from "@eslint/js";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";
import { defineConfig } from "eslint/config";

export default defineConfig(
  js.configs.recommended,
  tseslint.configs.recommended,
  vue.configs["flat/recommended"],
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "vue-router",
              importNames: ["useRouter"],
              message:
                "Use useTypedRouter() from '@/lib/useTypedRouter' instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // useTypedRouter.ts is the one file that wraps useRouter — allow it there
    files: ["src/lib/useTypedRouter.ts"],
    rules: { "no-restricted-imports": "off" },
  },
);
