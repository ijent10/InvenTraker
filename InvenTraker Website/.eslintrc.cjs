module.exports = {
  root: true,
  ignorePatterns: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: "module"
      },
      rules: {
        "no-console": ["warn", { allow: ["warn", "error"] }]
      }
    },
    {
      files: ["apps/web/src/app/**/*.tsx", "apps/web/src/components/**/*.tsx"],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector: "JSXOpeningElement[name.name='input']",
            message: "Use shared form primitives from @inventracker/ui (AppInput/AppCheckbox/AppSlider)."
          },
          {
            selector: "JSXOpeningElement[name.name='select']",
            message: "Use AppSelect from @inventracker/ui."
          },
          {
            selector: "JSXOpeningElement[name.name='textarea']",
            message: "Use AppTextarea from @inventracker/ui."
          },
          {
            selector: "JSXOpeningElement[name.name='button']",
            message: "Use AppButton from @inventracker/ui."
          }
        ]
      }
    }
  ]
}
