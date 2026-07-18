const FLEX_LAYOUT_RULE = "happy2-layout/use-flex-layout";
const SCROLLPORT_SPACING_RULE = "happy2-layout/scrollport-no-spacing";
const MINIMUM_REASON_LENGTH = 12;

const alternativeDisplayValues = new Set([
    "grid",
    "inline-block",
    "inline-grid",
    "inline-table",
    "table",
    "table-caption",
    "table-cell",
    "table-column",
    "table-column-group",
    "table-footer-group",
    "table-header-group",
    "table-row",
    "table-row-group",
]);

function normalizedStaticValue(sourceCode, valueNode) {
    return sourceCode
        .getText(valueNode)
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .trim()
        .toLowerCase();
}

function alternativeLayout(property, value) {
    if (property === "display" && alternativeDisplayValues.has(value)) {
        return `display: ${value}`;
    }
    if (property === "float" && value !== "none") {
        return `float: ${value}`;
    }
    if (property === "columns" || (property === "column-count" && value !== "auto")) {
        return `${property}: ${value}`;
    }
    return undefined;
}

function jsxPropertyName(property) {
    if (property.computed) return undefined;
    if (property.key?.type === "Identifier") return property.key.name;
    if (property.key?.type === "StringLiteral" || property.key?.type === "Literal") {
        return property.key.value;
    }
    return undefined;
}

function jsxStaticString(value) {
    if (
        value?.type === "StringLiteral" ||
        value?.type === "NumericLiteral" ||
        value?.type === "Literal"
    ) {
        return typeof value.value === "string" || typeof value.value === "number"
            ? String(value.value)
            : undefined;
    }
    if (value?.type === "TemplateLiteral" && value.expressions.length === 0) {
        return value.quasis[0]?.value.cooked;
    }
    if (
        value?.type === "UnaryExpression" &&
        (value.operator === "+" || value.operator === "-") &&
        (value.argument?.type === "NumericLiteral" || value.argument?.type === "Literal") &&
        typeof value.argument.value === "number"
    ) {
        return `${value.operator}${value.argument.value}`;
    }
    return undefined;
}

function cssPropertyName(property) {
    return property.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`);
}

const useFlexLayout = {
    meta: {
        type: "suggestion",
        docs: {
            description: "Require flexbox unless an alternative layout is locally justified.",
        },
        messages: {
            preferFlex:
                "{{layout}} bypasses the flexbox layout default. Use flexbox, or add an adjacent `eslint-disable-next-line happy2-layout/use-flex-layout -- <concrete reason>` exception.",
        },
        schema: [],
    },
    create(context) {
        const { sourceCode } = context;

        function report(node, property, value) {
            const layout = alternativeLayout(property, value);
            if (layout) {
                context.report({ node, messageId: "preferFlex", data: { layout } });
            }
        }

        if (sourceCode.ast.type === "StyleSheet") {
            return {
                Declaration(node) {
                    report(
                        node,
                        node.property.toLowerCase(),
                        normalizedStaticValue(sourceCode, node.value),
                    );
                },
            };
        }

        return {
            JSXAttribute(node) {
                if (node.name?.name !== "style" || node.value?.type !== "JSXExpressionContainer") {
                    return;
                }
                const style = node.value.expression;
                if (style?.type !== "ObjectExpression") return;

                for (const property of style.properties) {
                    if (property.type !== "ObjectProperty" && property.type !== "Property")
                        continue;
                    const name = jsxPropertyName(property);
                    const value = jsxStaticString(property.value)?.trim().toLowerCase();
                    if (typeof name === "string" && value) {
                        report(property, cssPropertyName(name), value);
                    }
                }
            },
        };
    },
};

function isScrollDeclaration(sourceCode, declaration) {
    if (!/^overflow(?:-[xy])?$/u.test(declaration.property.toLowerCase())) return false;
    return /(?:^|\s)(?:auto|scroll)(?:\s|$)/u.test(
        normalizedStaticValue(sourceCode, declaration.value),
    );
}

function isZeroSpacing(sourceCode, declaration) {
    return isZeroSpacingValue(normalizedStaticValue(sourceCode, declaration.value));
}

function isZeroSpacingValue(value) {
    return value.split(/\s+/u).every((part) => /^0(?:[a-z]+|%)?$/u.test(part));
}

const scrollportNoSpacing = {
    meta: {
        type: "problem",
        docs: {
            description: "Keep scrollports edge-to-edge and move spacing to an inner wrapper.",
        },
        messages: {
            moveSpacing:
                "A scrollport cannot own non-zero {{property}} because its viewport and scrollbar must stay edge-to-edge. Move the spacing to an inner flex wrapper.",
        },
        schema: [],
    },
    create(context) {
        const { sourceCode } = context;
        if (sourceCode.ast.type !== "StyleSheet") {
            return {
                JSXAttribute(node) {
                    if (
                        node.name?.name !== "style" ||
                        node.value?.type !== "JSXExpressionContainer" ||
                        node.value.expression?.type !== "ObjectExpression"
                    ) {
                        return;
                    }

                    const properties = node.value.expression.properties.flatMap((property) => {
                        if (property.type !== "ObjectProperty" && property.type !== "Property") {
                            return [];
                        }
                        const name = jsxPropertyName(property);
                        const value = jsxStaticString(property.value)?.trim().toLowerCase();
                        return typeof name === "string" && value
                            ? [{ name: cssPropertyName(name), node: property, value }]
                            : [];
                    });
                    if (
                        !properties.some(
                            ({ name, value }) =>
                                /^overflow(?:-[xy])?$/u.test(name) &&
                                /(?:^|\s)(?:auto|scroll)(?:\s|$)/u.test(value),
                        )
                    ) {
                        return;
                    }

                    for (const property of properties) {
                        if (
                            /^(?:margin|padding)(?:$|-)/u.test(property.name) &&
                            !isZeroSpacingValue(property.value)
                        ) {
                            context.report({
                                node: property.node,
                                messageId: "moveSpacing",
                                data: { property: property.name },
                            });
                        }
                    }
                },
            };
        }

        const rulesBySelector = new Map();

        return {
            Rule(node) {
                const declarations = node.block.children.filter(
                    (child) => child.type === "Declaration",
                );
                const selector = sourceCode
                    .getText(node.prelude)
                    .replace(/\/\*[\s\S]*?\*\//gu, "")
                    .replace(/\s+/gu, " ")
                    .trim();
                if (!selector) return;

                const state = rulesBySelector.get(selector) ?? { scrolls: false, spacing: [] };
                state.scrolls ||= declarations.some((declaration) =>
                    isScrollDeclaration(sourceCode, declaration),
                );

                for (const declaration of declarations) {
                    const property = declaration.property.toLowerCase();
                    if (
                        /^(?:margin|padding)(?:$|-)/u.test(property) &&
                        !isZeroSpacing(sourceCode, declaration)
                    ) {
                        state.spacing.push({ declaration, property });
                    }
                }
                rulesBySelector.set(selector, state);
            },
            "StyleSheet:exit"() {
                for (const { scrolls, spacing } of rulesBySelector.values()) {
                    if (!scrolls) continue;
                    for (const { declaration, property } of spacing) {
                        context.report({
                            node: declaration,
                            messageId: "moveSpacing",
                            data: { property },
                        });
                    }
                }
            },
        };
    },
};

function layoutDisable(comment, ruleName) {
    if (!comment.value.includes(ruleName)) return undefined;
    const directive = /\beslint-disable(?<scope>-next-line|-line)?\b/u.exec(comment.value);
    if (!directive) return undefined;

    const separator = comment.value.indexOf("--");
    return {
        local: Boolean(directive.groups?.scope),
        reason: separator === -1 ? "" : comment.value.slice(separator + 2).trim(),
    };
}

const requireLayoutExceptionReason = {
    meta: {
        type: "problem",
        docs: {
            description: "Require every flexbox-policy suppression to explain the exception.",
        },
        messages: {
            forbiddenScrollportException:
                "The full-bleed scrollport rule cannot be disabled. Move spacing to an inner flex wrapper.",
            missingReason:
                "A flexbox-policy exception must include a concrete reason after `--` (at least {{minimum}} characters).",
            nonLocalException:
                "A flexbox-policy exception must target one declaration with `eslint-disable-next-line` or `eslint-disable-line`; block and file disables are forbidden.",
        },
        schema: [],
    },
    create(context) {
        const { sourceCode } = context;
        let checked = false;

        function check() {
            if (checked) return;
            checked = true;
            const comments = sourceCode.comments ?? sourceCode.getAllComments?.() ?? [];
            for (const comment of comments) {
                const scrollportDisable = layoutDisable(comment, SCROLLPORT_SPACING_RULE);
                if (scrollportDisable) {
                    context.report({
                        loc: comment.loc,
                        messageId: "forbiddenScrollportException",
                    });
                }

                const disable = layoutDisable(comment, FLEX_LAYOUT_RULE);
                if (!disable) continue;
                if (!disable.local) {
                    context.report({ loc: comment.loc, messageId: "nonLocalException" });
                } else if (disable.reason.length < MINIMUM_REASON_LENGTH) {
                    context.report({
                        loc: comment.loc,
                        messageId: "missingReason",
                        data: { minimum: MINIMUM_REASON_LENGTH },
                    });
                }
            }
        }

        return sourceCode.ast.type === "StyleSheet" ? { StyleSheet: check } : { Program: check };
    },
};

export default {
    meta: { name: "eslint-plugin-happy2-layout", version: "0.1.0" },
    rules: {
        "require-layout-exception-reason": requireLayoutExceptionReason,
        "scrollport-no-spacing": scrollportNoSpacing,
        "use-flex-layout": useFlexLayout,
    },
};
