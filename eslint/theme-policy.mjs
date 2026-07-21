import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const THEME_FILE = "/packages/happy2-ui/src/theme.css";
const THEME_PATH = fileURLToPath(new URL("../packages/happy2-ui/src/theme.css", import.meta.url));

const directColorPattern = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/iu;

function isThemeFile(filename) {
    return filename.replaceAll("\\", "/").endsWith(THEME_FILE);
}

function hasDirectColor(sourceCode, declaration) {
    return directColorPattern.test(sourceCode.getText(declaration.value));
}

const themeVariables = new Set(
    [...readFileSync(THEME_PATH, "utf8").matchAll(/(?:^|[;{\n]\s*)(--[\w-]+)\s*:/gu)].map(
        (match) => match[1],
    ),
);

function referencedVariables(sourceCode, declaration) {
    return [...sourceCode.getText(declaration.value).matchAll(/var\(\s*(--[\w-]+)/gu)].map(
        (match) => match[1],
    );
}

function isColorDeclaration(property) {
    return /^(?:accent-color|background(?:-color)?|border(?:-(?:block|block-end|block-start|bottom|color|inline|inline-end|inline-start|left|right|top))?|box-shadow|caret-color|color|column-rule(?:-color)?|fill|filter|outline(?:-color)?|scrollbar-color|stroke|text-decoration(?:-color)?|text-shadow)$/u.test(
        property.toLowerCase(),
    );
}

const noDirectColor = {
    meta: {
        type: "problem",
        docs: {
            description: "Require CSS colors to be referenced from the central theme.",
        },
        messages: {
            useThemeToken:
                "Direct color values belong in packages/happy2-ui/src/theme.css. Reference a theme token with var(--token) here.",
        },
        schema: [],
    },
    create(context) {
        const { sourceCode } = context;
        if (isThemeFile(context.filename)) return {};

        return {
            Declaration(node) {
                if (node.property.startsWith("--") || !hasDirectColor(sourceCode, node)) return;
                context.report({ node, messageId: "useThemeToken" });
            },
        };
    },
};

const themeColorVariablesOnly = {
    meta: {
        type: "problem",
        docs: {
            description: "Allow literal color custom properties only in the central theme.",
        },
        messages: {
            defineThemeToken:
                "Color custom properties may only be defined in packages/happy2-ui/src/theme.css. Define a theme token there, then reference it with var(--token).",
        },
        schema: [],
    },
    create(context) {
        const { sourceCode } = context;
        if (isThemeFile(context.filename)) return {};

        return {
            Declaration(node) {
                if (!node.property.startsWith("--") || !hasDirectColor(sourceCode, node)) return;
                context.report({ node, messageId: "defineThemeToken" });
            },
        };
    },
};

const themeColorVariableReferencesOnly = {
    meta: {
        type: "problem",
        docs: {
            description: "Require color CSS variable references to resolve to the central theme.",
        },
        messages: {
            missingThemeVariable:
                "{{variable}} is not declared in packages/happy2-ui/src/theme.css. Define it there before referencing it.",
        },
        schema: [],
    },
    create(context) {
        const { sourceCode } = context;
        if (isThemeFile(context.filename)) return {};

        return {
            Declaration(node) {
                if (!isColorDeclaration(node.property)) return;
                for (const variable of referencedVariables(sourceCode, node)) {
                    if (!themeVariables.has(variable)) {
                        context.report({
                            node,
                            messageId: "missingThemeVariable",
                            data: { variable },
                        });
                    }
                }
            },
        };
    },
};

export default {
    meta: { name: "eslint-plugin-happy2-theme", version: "0.1.0" },
    rules: {
        "no-direct-color": noDirectColor,
        "theme-color-variables-only": themeColorVariablesOnly,
        "theme-color-variable-references-only": themeColorVariableReferencesOnly,
    },
};
