module.exports = {
  env: {
    browser: true,
    node: true,
  },
  extends: [
    'airbnb',
    'airbnb-typescript',
    'airbnb/hooks',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "prettier"],
  parserOptions: {
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
    },
  },
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      parser: "@typescript-eslint/parser",
      rules: {
        "no-undef": "off",
        "no-unused-vars": "off",
        "no-shadow": "off",
        "@typescript-eslint/no-unused-vars": ["error"],
        "@typescript-eslint/no-shadow": ["error"],
        "react/require-default-props": ["off"],
      },
      parserOptions : {
        project: './tsconfig.json',
      },
    },
  ],
};
