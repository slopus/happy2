import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import router from "@tanstack/eslint-plugin-router";
import { defineConfig, globalIgnores } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

const common = {
    extends: [
        js.configs.recommended,
        react.configs.flat.recommended,
        react.configs.flat["jsx-runtime"],
        reactHooks.configs.flat["recommended-latest"],
        jsxA11y.flatConfigs.recommended,
        ...router.configs["flat/recommended"],
    ],
    settings: { react: { version: "detect" } },
    rules: {
        "no-restricted-imports": [
            "error",
            {
                paths: [
                    {
                        name: "react",
                        importNames: ["useEffect", "useState"],
                        message:
                            "App state belongs in happy2-state/Zustand. useEffect and useState are not allowed in happy2-app.",
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
                    "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(useEffect|useState)$/]",
                message:
                    "App state belongs in happy2-state/Zustand. useEffect and useState are not allowed in happy2-app.",
            },
        ],
        "react/prop-types": "off",
        "react-hooks/exhaustive-deps": "error",
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
);
