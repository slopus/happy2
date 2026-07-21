import js from "@eslint/js";
import css from "@eslint/css";
import babelParser from "@babel/eslint-parser";
import { defineConfig, globalIgnores } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import layoutPolicy from "../../eslint/layout-policy.mjs";
import themePolicy from "../../eslint/theme-policy.mjs";

const common = {
    plugins: { "happy2-layout": layoutPolicy },
    extends: [
        js.configs.recommended,
        react.configs.flat.recommended,
        react.configs.flat["jsx-runtime"],
        reactHooks.configs.flat["recommended-latest"],
        jsxA11y.flatConfigs.recommended,
    ],
    settings: { react: { version: "detect" } },
    rules: {
        "no-restricted-imports": [
            "error",
            {
                paths: [
                    {
                        name: "react",
                        importNames: ["useEffect"],
                        message:
                            "useEffect is not allowed in happy2-ui. Use event handlers, derived render state, or a scoped useLayoutEffect for imperative DOM work.",
                    },
                ],
            },
        ],
        "no-undef": "off",
        "no-unused-vars": "off",
        "no-restricted-syntax": [
            "error",
            {
                selector:
                    "CallExpression[callee.type='MemberExpression'][callee.property.name='useEffect']",
                message:
                    "useEffect is not allowed in happy2-ui. Use event handlers, derived render state, or a scoped useLayoutEffect for imperative DOM work.",
            },
        ],
        "react/prop-types": "off",
        "react-hooks/exhaustive-deps": "error",
        "jsx-a11y/no-autofocus": "off",
        "jsx-a11y/no-noninteractive-element-interactions": "off",
        "jsx-a11y/no-static-element-interactions": "off",
        "happy2-layout/require-layout-exception-reason": "error",
        "happy2-layout/scrollport-no-spacing": "error",
        "happy2-layout/use-flex-layout": "error",
    },
};

function languageOptions(plugins) {
    return {
        parser: babelParser,
        globals: { ...globals.browser, ...globals.node },
        parserOptions: {
            requireConfigFile: false,
            babelOptions: {
                babelrc: false,
                configFile: false,
                parserOpts: { plugins },
            },
        },
    };
}

export default defineConfig(
    globalIgnores(["dist/**", "coverage/**"]),
    { ...common, files: ["**/*.ts"], languageOptions: languageOptions(["typescript"]) },
    {
        ...common,
        files: ["**/*.tsx"],
        languageOptions: languageOptions(["typescript", "jsx"]),
    },
    {
        files: ["src/**/*.css"],
        language: "css/css",
        languageOptions: { tolerant: true },
        plugins: { css, "happy2-layout": layoutPolicy, "happy2-theme": themePolicy },
        rules: {
            "happy2-layout/require-layout-exception-reason": "error",
            "happy2-layout/scrollport-no-spacing": "error",
            "happy2-layout/use-flex-layout": "error",
            "happy2-theme/no-direct-color": "error",
            "happy2-theme/theme-color-variables-only": "error",
            "happy2-theme/theme-color-variable-references-only": "error",
        },
    },
    {
        files: ["**/*.test.tsx"],
        rules: {
            "happy2-layout/use-flex-layout": "off",
            "react-hooks/globals": "off",
            "react/no-children-prop": "off",
        },
    },
    {
        files: ["dev/**/*.{ts,tsx}"],
        rules: { "happy2-layout/use-flex-layout": "off" },
    },
);
